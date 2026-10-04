import { randomBytes } from "node:crypto";
import { buildDailyPortalAuthEntryUrl } from "@/lib/server/dailyPortalAuthEntry";
import { acceptanceEmail, acceptanceRecipients, acceptanceFormationFields, acceptanceSessionFields } from "@/lib/server/dailyAcceptanceEmail";
import { deliverLearnerEmail, provenDelivery } from "@/lib/server/dailyLearnerEmailDelivery";

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
  const instructions = "À la première connexion, cliquez sur « Activer mon accès », puis choisissez votre mot de passe. Utilisez de préférence 12 caractères ou plus avec majuscule, minuscule, chiffre et symbole. Si le mot de passe est refusé, choisissez-en un autre sur la même page.";
  const textBody = [greeting, "", body, "", `Accéder à mon espace : ${input.portalUrl}`, "", instructions, "", "Si vous avez reçu plusieurs messages, utilisez le dernier. Conservez ce lien personnel et ne le transmettez pas.", "", "Selen Editions"].join("\n");
  const htmlBody = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
    <p>${escapeHtml(greeting)}</p>
    <p>${escapeHtml(body)}</p>
    <p><a href="${escapeHtml(input.portalUrl)}" style="display:inline-block;padding:12px 18px;background:#4f392d;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">Accéder à mon espace apprenant</a></p>
    <p>${escapeHtml(instructions)}</p>
    <p style="font-size:13px;color:#70503b">Si vous avez reçu plusieurs messages, utilisez le dernier. Ce lien est personnel. Ne le transmettez pas.</p>
    <p>Selen Editions</p>
  </div>`;
  return { subject, text: textBody, html: htmlBody };
}

type AdminClient = any;
type LearnerAccessSource = "accepted_registration_request" | "manual_enrolment" | "manual_resend";

type EnsureAccessInput = {
  enrolmentId: string;
  registrationRequestId?: string | null;
  origin: string;
  createdBy?: string | null;
  source?: LearnerAccessSource;
  force?: boolean;
  organisationId?: string;
};

export type LearnerPortalAccessResult = {
  enrolmentId: string;
  learnerId?: string;
  email?: string;
  portalAccessId?: string;
  status: "sent" | "already_sent" | "missing_email" | "send_failed" | "not_found" | "invalid_scope" | "pending";
  communicationId?: string;
  portalUrl?: string;
};

export async function ensureAndSendLearnerPortalAccess(admin: AdminClient, input: EnsureAccessInput): Promise<LearnerPortalAccessResult> {
  const source = input.source ?? "accepted_registration_request";
  const force = source === "manual_resend" && input.force === true;
  const { data: enrolment, error: enrolmentError } = await admin
    .from("daily_session_enrolments")
    .select(`id,organisation_id,session_id,learner_id,status,contracting_party_type,company_name,daily_learners(id,organisation_id,first_name,last_name,email),daily_sessions(${acceptanceSessionFields},daily_formations(${acceptanceFormationFields}))`)
    .eq("id", input.enrolmentId)
    .maybeSingle();
  if (enrolmentError || !enrolment) return { enrolmentId: input.enrolmentId, status: "not_found" };
  if (["declined", "cancelled", "abandoned"].includes(String(enrolment.status ?? ""))) {
    return { enrolmentId: input.enrolmentId, learnerId: enrolment.learner_id, status: "invalid_scope" };
  }

  const learner = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
  const session = Array.isArray(enrolment.daily_sessions) ? enrolment.daily_sessions[0] : enrolment.daily_sessions;
  const formation = Array.isArray(session?.daily_formations) ? session.daily_formations[0] : session?.daily_formations;
  if (!learner || !session || session.organisation_id !== enrolment.organisation_id || learner.organisation_id !== enrolment.organisation_id || formation?.organisation_id !== enrolment.organisation_id || (input.organisationId && enrolment.organisation_id !== input.organisationId)) {
    return { enrolmentId: input.enrolmentId, learnerId: enrolment.learner_id, status: "invalid_scope" };
  }

  let organisation: any = null;
  if (source === "accepted_registration_request") {
    if (!input.registrationRequestId || !input.organisationId) return { enrolmentId: enrolment.id, status: "invalid_scope" };
    const context = await acceptedContext(admin, input.registrationRequestId, input.organisationId);
    if (!context || context.request.formation_id !== session.formation_id || context.request.attached_session_id !== session.id) return { enrolmentId: enrolment.id, status: "invalid_scope" };
    const { data: link, error: linkError } = await admin.from("daily_registration_request_enrolments").select("enrolment_id").eq("registration_request_id", input.registrationRequestId).eq("enrolment_id", enrolment.id).maybeSingle();
    if (!text(learner.email)) return { enrolmentId: enrolment.id, learnerId: learner.id, status: "missing_email" };
    if (linkError || !link || !acceptanceRecipients(context.request).some(p => p.email && p.email === text(learner.email).toLowerCase())) return { enrolmentId: enrolment.id, status: "invalid_scope" };
    organisation = context.organisation;
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
          source,
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
  if (!force) {
    const { data: previous, error: previousError } = await admin
      .from("daily_communications")
      .select("id,status,sent_at,provider_message_id")
      .eq("organisation_id", enrolment.organisation_id)
      .eq("session_id", session.id)
      .eq("communication_type", "learner_portal_access")
      .eq("recipient_email", email)
      .contains("metadata", { portal_access_id: access.id, enrolment_id: enrolment.id })
      .contains("metadata", { auth_protected: true })
      .in("status", ["queued", "sent", "delivered", "bounced"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousError) throw previousError;
    if (previous) {
      return { enrolmentId: enrolment.id, learnerId: learner.id, email, portalAccessId: access.id, status: provenDelivery(previous), communicationId: previous.id, portalUrl };
    }
  }

  const delivery = await deliverLearnerEmail(admin, {
    key: `learner_portal_access:${enrolment.organisation_id}:${enrolment.id}:${access.id}:${email}`,
    force,
    row: {
      organisation_id: enrolment.organisation_id, session_id: session.id, enrolment_id: enrolment.id,
      communication_type: "learner_portal_access", channel: "email", recipient_email: email,
      recipient_name: learnerName || null, provider: "resend", created_by: input.createdBy ?? session.user_id,
      metadata: { portal_access_id: access.id, learner_id: learner.id, enrolment_id: enrolment.id, registration_request_id: input.registrationRequestId ?? null, source, auth_protected: true },
    },
    message: async () => {
      const authUrl = await buildDailyPortalAuthEntryUrl({ email, portalType: "learner", token: access.token });
      return source === "accepted_registration_request"
        ? acceptanceEmail({ name: learnerName, formation, organisation, session, enrolment, origin: input.origin, portalUrl: authUrl })
        : portalEmail({ learnerName, formationTitle: text(formation?.title) || "Formation Selen Daily", portalUrl: authUrl });
    },
  });
  return { enrolmentId: enrolment.id, learnerId: learner.id, email, portalAccessId: access.id, ...delivery, portalUrl };
}

async function acceptedContext(admin: AdminClient, requestId: string, organisationId: string) {
  const { data: request, error } = await admin.from("daily_formation_registration_requests").select("id,formation_id,decision_status,response_type,respondent_first_name,respondent_last_name,respondent_email,participants,attached_session_id").eq("id", requestId).maybeSingle();
  if (error) throw error;
  if (!request || request.decision_status !== "accepted") return null;
  const { data: formation, error: formationError } = await admin.from("daily_formations").select(acceptanceFormationFields).eq("id", request.formation_id).eq("organisation_id", organisationId).maybeSingle();
  if (formationError) throw formationError;
  if (!formation || formation.organisation_id !== organisationId) return null;
  const { data: organisation, error: organisationError } = await admin.from("organisations").select("id,name,email,phone,address,contact_name").eq("id", organisationId).maybeSingle();
  if (organisationError) throw organisationError;
  if (!organisation || organisation.id !== organisationId) return null;
  let session = null;
  if (request.attached_session_id) {
    const { data, error: sessionError } = await admin.from("daily_sessions").select(acceptanceSessionFields).eq("id", request.attached_session_id).eq("organisation_id", organisationId).eq("formation_id", formation.id).maybeSingle();
    if (sessionError) throw sessionError;
    if (!data || data.organisation_id !== organisationId || data.formation_id !== formation.id) return null;
    session = data;
  }
  return { request, formation, organisation, session };
}

export async function sendLearnerPortalAccessForRegistrationRequest(admin: AdminClient, input: { registrationRequestId: string; organisationId: string; origin: string; createdBy?: string | null }) {
  const context = await acceptedContext(admin, input.registrationRequestId, input.organisationId);
  if (!context) return [{ enrolmentId: "", status: "invalid_scope" as const }];
  const { data: links, error } = await admin
    .from("daily_registration_request_enrolments")
    .select("enrolment_id")
    .eq("registration_request_id", input.registrationRequestId);
  if (error) throw error;
  const enrolmentIds: string[] = [...new Set<string>((links ?? []).map((row: { enrolment_id?: unknown }) => String(row.enrolment_id ?? "").trim()).filter(Boolean))];
  const results: LearnerPortalAccessResult[] = [];
  if (enrolmentIds.length) {
    for (const enrolmentId of enrolmentIds) {
      try {
        results.push(await ensureAndSendLearnerPortalAccess(admin, { ...input, enrolmentId, source: "accepted_registration_request" }));
      } catch { results.push({ enrolmentId, status: "send_failed" }); }
    }
    return results;
  }
  const recipients = acceptanceRecipients(context.request);
  if (!recipients.length) return [{ enrolmentId: "", status: "missing_email" as const }];
  for (const recipient of recipients) {
    if (!recipient.email) { results.push({ enrolmentId: "", status: "missing_email" }); continue; }
    try {
      const delivery = await deliverLearnerEmail(admin, {
        key: `registration_acceptance:${input.organisationId}:${input.registrationRequestId}:${recipient.email}`,
        row: { organisation_id: input.organisationId, session_id: context.session?.id ?? null, enrolment_id: null,
          communication_type: "learner_registration_acceptance", channel: "email", recipient_email: recipient.email, recipient_name: recipient.name || null,
          provider: "resend", created_by: input.createdBy ?? null, metadata: { registration_request_id: input.registrationRequestId, source: "accepted_registration_request" } },
        message: async () => acceptanceEmail({ name: recipient.name, ...context, origin: input.origin }),
      });
      results.push({ enrolmentId: "", email: recipient.email, ...delivery });
    } catch { results.push({ enrolmentId: "", email: recipient.email, status: "send_failed" }); }
  }
  return results;
}
