import { randomBytes } from "node:crypto";
import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function portalEmail(input: { learnerName: string; formationTitle: string; portalUrl: string }) {
  const subject = `Votre espace apprenant · ${input.formationTitle}`;
  const greeting = input.learnerName ? `Bonjour ${input.learnerName},` : "Bonjour,";
  const body = `Votre inscription à la formation « ${input.formationTitle} » est enregistrée. Vous pouvez désormais accéder à votre espace apprenant Selen Daily.`;
  const textBody = [greeting, "", body, "", `Accéder à mon espace : ${input.portalUrl}`, "", "Conservez ce lien personnel et ne le transmettez pas.", "", "Selen Editions"].join("\n");
  const htmlBody = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
    <p>${escapeHtml(greeting)}</p>
    <p>${escapeHtml(body)}</p>
    <p><a href="${escapeHtml(input.portalUrl)}" style="display:inline-block;padding:12px 18px;background:#4f392d;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">Accéder à mon espace apprenant</a></p>
    <p style="font-size:13px;color:#70503b">Ce lien est personnel. Ne le transmettez pas.</p>
    <p>Selen Editions</p>
  </div>`;
  return { subject, text: textBody, html: htmlBody };
}

type AdminClient = any;

type EnsureAccessInput = {
  enrolmentId: string;
  registrationRequestId?: string | null;
  origin: string;
  createdBy?: string | null;
};

export type LearnerPortalAccessResult = {
  enrolmentId: string;
  learnerId?: string;
  email?: string;
  portalAccessId?: string;
  status: "sent" | "already_sent" | "missing_email" | "send_failed" | "not_found" | "invalid_scope";
  communicationId?: string;
  portalUrl?: string;
};

export async function ensureAndSendLearnerPortalAccess(admin: AdminClient, input: EnsureAccessInput): Promise<LearnerPortalAccessResult> {
  const { data: enrolment, error: enrolmentError } = await admin
    .from("daily_session_enrolments")
    .select("id,organisation_id,session_id,learner_id,status,daily_learners(id,first_name,last_name,email),daily_sessions(id,user_id,organisation_id,formation_id,daily_formations(id,title))")
    .eq("id", input.enrolmentId)
    .maybeSingle();
  if (enrolmentError || !enrolment) return { enrolmentId: input.enrolmentId, status: "not_found" };
  if (["declined", "cancelled", "abandoned"].includes(String(enrolment.status ?? ""))) {
    return { enrolmentId: input.enrolmentId, learnerId: enrolment.learner_id, status: "invalid_scope" };
  }

  const learner = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
  const session = Array.isArray(enrolment.daily_sessions) ? enrolment.daily_sessions[0] : enrolment.daily_sessions;
  const formation = Array.isArray(session?.daily_formations) ? session.daily_formations[0] : session?.daily_formations;
  if (!learner || !session || session.organisation_id !== enrolment.organisation_id) {
    return { enrolmentId: input.enrolmentId, learnerId: enrolment.learner_id, status: "invalid_scope" };
  }

  const email = text(learner.email).toLowerCase();
  const learnerName = [text(learner.first_name), text(learner.last_name)].filter(Boolean).join(" ");
  if (!email) return { enrolmentId: input.enrolmentId, learnerId: learner.id, status: "missing_email" };

  const entityKey = `learner:${learner.id}`;
  const { data: existingAccess, error: existingError } = await admin
    .from("daily_portal_access_tokens")
    .select("id,token,status,expires_at")
    .eq("session_id", session.id)
    .eq("portal_type", "learner")
    .eq("entity_key", entityKey)
    .maybeSingle();
  if (existingError) throw existingError;

  let access = existingAccess;
  if (!access) {
    const token = randomBytes(32).toString("base64url");
    const { data: created, error: createError } = await admin
      .from("daily_portal_access_tokens")
      .insert({
        session_id: session.id,
        user_id: session.user_id,
        portal_type: "learner",
        entity_key: entityKey,
        entity_name: learnerName || null,
        entity_email: email,
        token,
        status: "pending",
        metadata: {
          learner_id: learner.id,
          enrolment_id: enrolment.id,
          registration_request_id: input.registrationRequestId ?? null,
          source: "accepted_registration_request",
        },
      })
      .select("id,token,status,expires_at")
      .single();
    if (createError) throw createError;
    access = created;
  } else if (["revoked", "expired"].includes(String(access.status ?? ""))) {
    const token = randomBytes(32).toString("base64url");
    const { data: renewed, error: renewError } = await admin
      .from("daily_portal_access_tokens")
      .update({ token, status: "pending", viewed_at: null, expires_at: null, entity_name: learnerName || null, entity_email: email, updated_at: new Date().toISOString() })
      .eq("id", access.id)
      .select("id,token,status,expires_at")
      .single();
    if (renewError) throw renewError;
    access = renewed;
  }

  const portalUrl = `${input.origin}/daily/portail/learner/${encodeURIComponent(access.token)}`;
  const { data: previous, error: previousError } = await admin
    .from("daily_communications")
    .select("id,status,sent_at")
    .eq("organisation_id", enrolment.organisation_id)
    .eq("session_id", session.id)
    .eq("communication_type", "learner_portal_access")
    .eq("recipient_email", email)
    .contains("metadata", { portal_access_id: access.id, enrolment_id: enrolment.id })
    .in("status", ["queued", "sent", "delivered"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw previousError;
  if (previous) {
    return { enrolmentId: enrolment.id, learnerId: learner.id, email, portalAccessId: access.id, status: "already_sent", communicationId: previous.id, portalUrl };
  }

  const message = portalEmail({ learnerName, formationTitle: text(formation?.title) || "Formation Selen Daily", portalUrl });
  const { data: communication, error: evidenceError } = await admin
    .from("daily_communications")
    .insert({
      organisation_id: enrolment.organisation_id,
      session_id: session.id,
      communication_type: "learner_portal_access",
      channel: "email",
      recipient_email: email,
      recipient_name: learnerName || null,
      subject: message.subject,
      text_body: message.text,
      html_body: message.html,
      provider: "resend",
      status: "queued",
      created_by: input.createdBy ?? session.user_id,
      metadata: {
        portal_access_id: access.id,
        learner_id: learner.id,
        enrolment_id: enrolment.id,
        registration_request_id: input.registrationRequestId ?? null,
      },
    })
    .select("id")
    .single();
  if (evidenceError || !communication) throw evidenceError ?? new Error("learner portal communication evidence missing");

  if (!resend) {
    await admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "missing_resend_api_key" }).eq("id", communication.id);
    return { enrolmentId: enrolment.id, learnerId: learner.id, email, portalAccessId: access.id, status: "send_failed", communicationId: communication.id, portalUrl };
  }

  const { data: sent, error: sendError } = await resend.emails.send({
    from: resendFromEmail,
    to: email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: "hello@selen-editions.fr",
  });
  if (sendError) {
    console.error("Daily : envoi de l’accès apprenant impossible", sendError);
    await admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "send_failed" }).eq("id", communication.id);
    return { enrolmentId: enrolment.id, learnerId: learner.id, email, portalAccessId: access.id, status: "send_failed", communicationId: communication.id, portalUrl };
  }

  const sentAt = new Date().toISOString();
  await admin.from("daily_communications").update({ provider_message_id: sent?.id ?? null, status: "sent", sent_at: sentAt, failed_at: null, failure_reason: null }).eq("id", communication.id);
  return { enrolmentId: enrolment.id, learnerId: learner.id, email, portalAccessId: access.id, status: "sent", communicationId: communication.id, portalUrl };
}

export async function sendLearnerPortalAccessForRegistrationRequest(admin: AdminClient, input: { registrationRequestId: string; origin: string; createdBy?: string | null }) {
  const { data: links, error } = await admin
    .from("daily_registration_request_enrolments")
    .select("enrolment_id")
    .eq("registration_request_id", input.registrationRequestId);
  if (error) throw error;
  const enrolmentIds = [...new Set((links ?? []).map((row: { enrolment_id: string }) => row.enrolment_id).filter(Boolean))];
  const results: LearnerPortalAccessResult[] = [];
  for (const enrolmentId of enrolmentIds) {
    results.push(await ensureAndSendLearnerPortalAccess(admin, { enrolmentId, registrationRequestId: input.registrationRequestId, origin: input.origin, createdBy: input.createdBy }));
  }
  return results;
}
