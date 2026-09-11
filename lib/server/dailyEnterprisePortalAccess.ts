import { randomBytes } from "node:crypto";
import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const normalizedEmail = (value: unknown) => text(value).toLowerCase();
const asArray = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

type AdminClient = any;
type EnterpriseAccessSource = "accepted_registration_request" | "manual_company";
type CompanyInput = { name?: string | null; email?: string | null; address?: string | null; siret?: string | null; participants?: unknown };

type EnsureInput = {
  sessionId: string;
  company: CompanyInput;
  origin: string;
  createdBy?: string | null;
  source: EnterpriseAccessSource;
  registrationRequestId?: string | null;
};

export type EnterprisePortalAccessResult = {
  sessionId: string;
  email?: string;
  portalAccessId?: string;
  communicationId?: string;
  portalUrl?: string;
  status: "sent" | "already_sent" | "missing_email" | "send_failed" | "not_found" | "invalid_scope";
};

function accessEmail(input: { companyName: string; formationTitle: string; portalUrl: string }) {
  const subject = `Votre espace entreprise · ${input.formationTitle}`;
  const greeting = input.companyName ? `Bonjour ${input.companyName},` : "Bonjour,";
  const body = `L’inscription à la formation « ${input.formationTitle} » est validée. Votre espace entreprise Selen Daily est désormais accessible.`;
  const textBody = [greeting, "", body, "", `Accéder à l’espace entreprise : ${input.portalUrl}`, "", "Conservez ce lien et ne le transmettez qu’aux personnes autorisées de votre organisation.", "", "Selen Editions"].join("\n");
  const htmlBody = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px"><p>${escapeHtml(greeting)}</p><p>${escapeHtml(body)}</p><p><a href="${escapeHtml(input.portalUrl)}" style="display:inline-block;padding:12px 18px;background:#4f392d;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">Accéder à l’espace entreprise</a></p><p style="font-size:13px;color:#70503b">Ce lien donne accès aux informations de cette session réservées à votre organisation.</p><p>Selen Editions</p></div>`;
  return { subject, text: textBody, html: htmlBody };
}

export async function ensureAndSendEnterprisePortalAccess(admin: AdminClient, input: EnsureInput): Promise<EnterprisePortalAccessResult> {
  const { data: session, error: sessionError } = await admin.from("daily_sessions").select("id,user_id,organisation_id,formation_id,daily_formations(id,title)").eq("id", input.sessionId).neq("status", "archived").maybeSingle();
  if (sessionError || !session) return { sessionId: input.sessionId, status: "not_found" };
  const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
  const email = normalizedEmail(input.company.email);
  const companyName = text(input.company.name);
  if (!email) return { sessionId: session.id, status: "missing_email" };

  const entityKey = `enterprise:${email}`;
  const { data: existing, error: existingError } = await admin.from("daily_portal_access_tokens").select("id,token,status,expires_at").eq("session_id", session.id).eq("portal_type", "enterprise").eq("entity_key", entityKey).limit(1).maybeSingle();
  if (existingError) throw existingError;

  let access = existing;
  if (!access) {
    const token = randomBytes(32).toString("base64url");
    const { data: created, error: createError } = await admin.from("daily_portal_access_tokens").insert({
      session_id: session.id,
      user_id: session.user_id,
      portal_type: "enterprise",
      entity_key: entityKey,
      entity_name: companyName || null,
      entity_email: email,
      token,
      status: "pending",
      metadata: { registration_request_id: input.registrationRequestId ?? null, source: input.source },
    }).select("id,token,status,expires_at").single();
    if (createError) throw createError;
    access = created;
  } else if (["revoked", "expired"].includes(String(access.status ?? ""))) {
    const token = randomBytes(32).toString("base64url");
    const { data: renewed, error: renewError } = await admin.from("daily_portal_access_tokens").update({ token, status: "pending", viewed_at: null, expires_at: null, entity_name: companyName || null, entity_email: email, updated_at: new Date().toISOString() }).eq("id", access.id).select("id,token,status,expires_at").single();
    if (renewError) throw renewError;
    access = renewed;
  }

  const portalUrl = `${input.origin}/daily/portail/enterprise/${encodeURIComponent(access.token)}`;
  const { data: previous, error: previousError } = await admin.from("daily_communications").select("id,status,sent_at").eq("organisation_id", session.organisation_id).eq("session_id", session.id).eq("communication_type", "enterprise_portal_access").eq("recipient_email", email).contains("metadata", { portal_access_id: access.id }).in("status", ["queued", "sent", "delivered"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (previousError) throw previousError;
  if (previous) return { sessionId: session.id, email, portalAccessId: access.id, status: "already_sent", communicationId: previous.id, portalUrl };

  const message = accessEmail({ companyName, formationTitle: text(formation?.title) || "Formation Selen Daily", portalUrl });
  const { data: communication, error: communicationError } = await admin.from("daily_communications").insert({
    organisation_id: session.organisation_id,
    session_id: session.id,
    communication_type: "enterprise_portal_access",
    channel: "email",
    recipient_email: email,
    recipient_name: companyName || null,
    subject: message.subject,
    text_body: message.text,
    html_body: message.html,
    provider: "resend",
    status: "queued",
    created_by: input.createdBy ?? session.user_id,
    metadata: { portal_access_id: access.id, entity_key: entityKey, registration_request_id: input.registrationRequestId ?? null, source: input.source },
  }).select("id").single();
  if (communicationError || !communication) throw communicationError ?? new Error("enterprise portal communication evidence missing");

  if (!resend) {
    await admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "missing_resend_api_key" }).eq("id", communication.id);
    return { sessionId: session.id, email, portalAccessId: access.id, status: "send_failed", communicationId: communication.id, portalUrl };
  }
  const { data: sent, error: sendError } = await resend.emails.send({ from: resendFromEmail, to: email, subject: message.subject, text: message.text, html: message.html, replyTo: "hello@selen-editions.fr" });
  if (sendError) {
    console.error("Daily : envoi de l’accès entreprise impossible", sendError);
    await admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "send_failed" }).eq("id", communication.id);
    return { sessionId: session.id, email, portalAccessId: access.id, status: "send_failed", communicationId: communication.id, portalUrl };
  }
  await admin.from("daily_communications").update({ provider_message_id: sent?.id ?? null, status: "sent", sent_at: new Date().toISOString(), failed_at: null, failure_reason: null }).eq("id", communication.id);
  return { sessionId: session.id, email, portalAccessId: access.id, status: "sent", communicationId: communication.id, portalUrl };
}

export async function sendEnterprisePortalAccessForSessionCompanies(admin: AdminClient, input: { sessionId: string; origin: string; createdBy?: string | null; source?: EnterpriseAccessSource }) {
  const { data: session, error } = await admin.from("daily_sessions").select("id,companies").eq("id", input.sessionId).maybeSingle();
  if (error || !session) return [];
  const companies = asArray(session.companies);
  const results: EnterprisePortalAccessResult[] = [];
  for (const company of companies) {
    if (!normalizedEmail(company.email)) continue;
    results.push(await ensureAndSendEnterprisePortalAccess(admin, { sessionId: session.id, company, origin: input.origin, createdBy: input.createdBy, source: input.source ?? "manual_company" }));
  }
  return results;
}

export async function sendEnterprisePortalAccessForRegistrationRequest(admin: AdminClient, input: { registrationRequestId: string; sessionId?: string | null; origin: string; createdBy?: string | null }) {
  const { data: request, error: requestError } = await admin.from("daily_formation_registration_requests").select("id,response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,participants,attached_session_id").eq("id", input.registrationRequestId).maybeSingle();
  if (requestError || !request || request.response_type !== "company") return [];
  const sessionId = text(input.sessionId) || text(request.attached_session_id);
  if (!sessionId) return [];
  const email = normalizedEmail(request.respondent_email);
  const companyName = text(request.company_name) || [text(request.respondent_first_name), text(request.respondent_last_name)].filter(Boolean).join(" ");
  if (!email) return [{ sessionId, status: "missing_email" as const }];

  const { data: session, error: sessionError } = await admin.from("daily_sessions").select("id,companies").eq("id", sessionId).maybeSingle();
  if (sessionError || !session) return [{ sessionId, status: "not_found" as const }];
  const companies = asArray(session.companies);
  const index = companies.findIndex((company) => normalizedEmail(company.email) === email || (companyName && text(company.name).toLowerCase() === companyName.toLowerCase()));
  const registrationCompany = { name: companyName, email, address: index >= 0 ? text(companies[index].address) : "", siret: index >= 0 ? text(companies[index].siret) : "", participants: asArray(request.participants) };
  const nextCompanies = [...companies];
  if (index >= 0) nextCompanies[index] = { ...companies[index], ...registrationCompany, participants: registrationCompany.participants.length ? registrationCompany.participants : asArray(companies[index].participants) };
  else nextCompanies.push(registrationCompany);
  const { error: syncError } = await admin.from("daily_sessions").update({ companies: nextCompanies, updated_at: new Date().toISOString() }).eq("id", sessionId);
  if (syncError) throw syncError;

  return [await ensureAndSendEnterprisePortalAccess(admin, { sessionId, company: registrationCompany, origin: input.origin, createdBy: input.createdBy, source: "accepted_registration_request", registrationRequestId: input.registrationRequestId })];
}
