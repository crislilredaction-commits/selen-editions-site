import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { sendDailyRegistrationConfirmation } from "@/lib/server/dailyRegistrationEmails";
import { normalizeBeneficiarySiret, validateOptionalBeneficiarySiret } from "@/lib/dailyBeneficiarySiret";
import { loadOriginalPositioning, OwnPositioningError, prepareOwnPositioning, persistOwnPositioning, positioningSubmissionAnswers, prepareJsonRegistrationSubmission, selenCandidatePositioningAnswers, type OwnPositioningSubmission } from "@/lib/server/dailyOwnPositioning";
import {
  buildDailyRegistrationSummary,
  DAILY_COMPANY_QUESTIONS,
  DAILY_NEED_QUESTIONS,
  DAILY_POSITIONING_QUESTIONS,
  detectAdaptationNeeded,
} from "@/lib/dailyRegistration";

type Params = { params: Promise<{ token: string }> };

type PublicSession = {
  id: string;
  formation_id: string;
  start_date: string | null;
  end_date: string | null;
  modality: string;
  distance_mode: string | null;
  status: string;
  schedule_blocks: unknown[];
  max_participants: number | null;
};

const FORMATION_FIELDS = "id,user_id,organisation_id,title,status,creation_mode,global_objective,learning_objectives,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,detailed_program,detailed_program_document_url,accessibility,pedagogical_resources,pedagogical_methods,evaluation_methods,positioning_mode,positioning_questions,positioning_questionnaire_document_url,contact_phone,contact_email,contact_website" as const;
const SESSION_SELECT = `id,user_id,organisation_id,formation_id,start_date,end_date,modality,distance_mode,status,schedule_blocks,registration_token,registration_status,adaptation_needed,companies,beneficiaries,individual_beneficiaries,daily_formations(${FORMATION_FIELDS})` as const;
const FORMATION_SELECT = `${FORMATION_FIELDS},public_registration_token,public_registration_enabled` as const;
const APPLICATION_CONSENT_TEXT =
  "Je certifie l'exactitude des informations renseignées dans ce dossier de candidature et confirme ma demande d'inscription à cette formation.";
const MAX_SIGNATURE_LENGTH = 500_000;

function cleanToken(value?: string | null) { return String(value ?? "").trim(); }
function text(body: Record<string, unknown>, key: string) { return String(body[key] ?? "").trim(); }
function jsonObject(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function jsonArray(value: unknown) { return Array.isArray(value) ? value : []; }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function sessionLabel(session: Pick<PublicSession, "start_date" | "end_date">) {
  if (!session.start_date) return null;
  const format = (value: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(`${value}T12:00:00Z`));
  return session.end_date && session.end_date !== session.start_date ? `du ${format(session.start_date)} au ${format(session.end_date)}` : `le ${format(session.start_date)}`;
}
function isAsynchronous(session: Pick<PublicSession, "modality" | "distance_mode">) { return session.modality === "distanciel" && session.distance_mode === "asynchrone"; }
function hasExplicitAdaptationAnswer(answers: Record<string, unknown>) {
  return String(answers.adaptation_needed_answer ?? answers.company_adaptation_needed ?? "").toLowerCase() === "oui";
}

function buildApplicationSignature(request: Request, body: Record<string, unknown>, targetId: string, responseType: string, needAnswers: Record<string, unknown>, positioningAnswers: Record<string, unknown>) {
  const consentAccepted = body.signature_consent === true;
  const signatureData = text(body, "signature_data");
  if (!consentAccepted) return { error: "Merci de confirmer votre accord avant de signer le dossier." } as const;
  if (!signatureData.startsWith("data:image/png;base64,")) return { error: "Merci de dessiner votre signature dans l'encadré prévu." } as const;
  if (signatureData.length > MAX_SIGNATURE_LENGTH) return { error: "La signature transmise est trop volumineuse. Merci de l'effacer puis de signer à nouveau." } as const;
  const signedAt = new Date().toISOString();
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent");
  const proofHash = createHash("sha256").update([
    targetId, responseType, text(body, "respondent_first_name"), text(body, "respondent_last_name"), text(body, "respondent_email").toLowerCase(),
    JSON.stringify(needAnswers), JSON.stringify(positioningAnswers), signedAt, APPLICATION_CONSENT_TEXT, signatureData,
  ].join("|")).digest("hex");
  return { value: { consent_text: APPLICATION_CONSENT_TEXT, signature_data: signatureData, signed_at: signedAt, ip_address: ipAddress, user_agent: userAgent, proof_hash: proofHash } } as const;
}

async function findSession(token: string) {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.from("daily_sessions").select(SESSION_SELECT).eq("registration_token", token).neq("status", "archived").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function findFormation(token: string) {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.from("daily_formations").select(FORMATION_SELECT).eq("public_registration_token", token).eq("public_registration_enabled", true).neq("status", "archived").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function findFutureSessions(formationId: string) {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.from("daily_sessions").select("id,formation_id,start_date,end_date,modality,distance_mode,status,schedule_blocks,max_participants").eq("formation_id", formationId).eq("status", "ready").gte("start_date", todayIso()).order("start_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicSession[];
}

async function findOrganisation(userId: string) {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.from("daily_onboarding").select("organisation_name,organisation_logo_url,address,platform_contact_email").eq("user_id", userId).maybeSingle();
  if (error) { console.warn("Daily registration: organisation identity unavailable", error.message); return null; }
  if (!data) return null;
  return { name: data.organisation_name ?? null, logo_url: data.organisation_logo_url ?? null, address: data.address ?? null, email: data.platform_contact_email ?? null };
}

async function sendConfirmationSafely(input: Parameters<typeof sendDailyRegistrationConfirmation>[0]) {
  try { return await sendDailyRegistrationConfirmation(input); }
  catch (error) { console.warn("Daily registration: confirmation email failed", error); return { sent: false, reason: "send_failed" as const }; }
}

function publicFormation(formation: Record<string, unknown>) {
  const { positioning_questionnaire_document_url: _privateReference, ...visible } = formation;
  return visible;
}
async function ownSubmissionReplay(submission: Pick<OwnPositioningSubmission, "id" | "fingerprint">, kind: "formation" | "session", targetId: string, userId: string) {
  const admin = getAdminSupabase();
  const { data, error } = await admin.from(kind === "formation" ? "daily_formation_registration_requests" : "daily_registration_responses")
    .select("*")
    .eq("id", submission.id).eq(kind === "formation" ? "formation_id" : "session_id", targetId).eq("user_id", userId).maybeSingle();
  if (error) throw new OwnPositioningError("Vérification de la transmission indisponible.", 500);
  if (!data) return null;
  if (data.positioning_answers?.submission_fingerprint !== submission.fingerprint) throw new OwnPositioningError("Cette transmission correspond à un dossier différent. Actualisez la page avant une nouvelle candidature.", 409);
  if (data.decision_status === "refused" || ["refused", "cancelled", "archived"].includes(data.status)) throw new OwnPositioningError("Ce dossier est clôturé. Contactez votre organisme de formation.", 409);
  const response = { id: data.id, status: data.status, submitted_at: data.submitted_at, signature_signed_at: data.signature_signed_at,
    ...(kind === "formation" ? { attached_session_id: data.attached_session_id } : {}) };
  const replaySessionId = kind === "session" ? targetId : data.attached_session_id;
  let nextStep = "date_to_plan";
  if (replaySessionId) {
    const { data: replaySession, error: replaySessionError } = await admin.from("daily_sessions").select("id,formation_id,modality,distance_mode").eq("id", replaySessionId).neq("status", "archived").maybeSingle();
    if (replaySessionError || !replaySession || (kind === "formation" && replaySession.formation_id !== targetId)) throw new OwnPositioningError("La candidature a été reçue, mais sa session ne peut pas être confirmée. Contactez votre organisme.", 409);
    nextStep = isAsynchronous(replaySession) ? "asynchronous" : "scheduled";
  }
  return NextResponse.json({ response, registrationKind: kind, alreadySubmitted: true, confirmationEmailSent: false,
    nextStep });
}

export async function GET(_request: Request, { params }: Params) {
  try {
  const { token } = await params;
  const clean = cleanToken(token);
  if (!clean) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  const session = await findSession(clean);
  if (session) {
    const organisation = await findOrganisation(session.user_id);
    const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
    if (formation && formation.organisation_id !== session.organisation_id) throw new OwnPositioningError("Formation introuvable.", 404);
    const original = formation ? await loadOriginalPositioning(getAdminSupabase(), formation) : null;
    return NextResponse.json({ registrationKind: "session", session: { ...session, daily_formations: formation ? publicFormation(formation) : null }, ownPositioning: original ? { id: original.id, name: original.name } : null, organisation, availableSessions: [], deliveryMode: session.modality === "distanciel" && session.distance_mode === "asynchrone" ? "asynchronous" : "scheduled", beneficiaryQuestions: DAILY_NEED_QUESTIONS, companyQuestions: DAILY_COMPANY_QUESTIONS, positioningQuestions: DAILY_POSITIONING_QUESTIONS, signatureConsentText: APPLICATION_CONSENT_TEXT });
  }
  const formation = await findFormation(clean);
  if (!formation) return NextResponse.json({ error: "Lien introuvable ou expiré." }, { status: 404 });
  const [organisation, futureSessions] = await Promise.all([findOrganisation(formation.user_id), findFutureSessions(formation.id)]);
  const original = await loadOriginalPositioning(getAdminSupabase(), formation);
  const asynchronousSessions = futureSessions.filter(isAsynchronous);
  const availableSessions = futureSessions.filter((item) => !isAsynchronous(item));
  const deliveryMode = availableSessions.length === 0 && asynchronousSessions.length > 0 ? "asynchronous" : availableSessions.length > 0 ? "scheduled" : "date_to_plan";
  return NextResponse.json({
    registrationKind: "formation", organisation, availableSessions, deliveryMode,
    session: { id: null, user_id: formation.user_id, registration_token: null, registration_status: "spontaneous", daily_formations: publicFormation(formation) },
    ownPositioning: original ? { id: original.id, name: original.name } : null,
    beneficiaryQuestions: DAILY_NEED_QUESTIONS, companyQuestions: DAILY_COMPANY_QUESTIONS, positioningQuestions: DAILY_POSITIONING_QUESTIONS, signatureConsentText: APPLICATION_CONSENT_TEXT,
  });
  } catch (cause) { return NextResponse.json({ error: cause instanceof OwnPositioningError ? cause.message : "Dossier indisponible." }, { status: cause instanceof OwnPositioningError ? cause.status : 500 }); }
}

export async function POST(request: Request, { params }: Params) {
  try {
  const { token } = await params;
  const clean = cleanToken(token);
  if (!clean) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  const multipart = request.headers.get("content-type")?.startsWith("multipart/form-data") ?? false;
  const formData = multipart ? await request.formData().catch(() => null) : null;
  let body: Record<string, unknown>;
  if (multipart) {
    const payload = String(formData?.get("payload") ?? "");
    if (payload.length > 750_000) return NextResponse.json({ error: "Dossier trop volumineux." }, { status: 413 });
    try { body = jsonObject(JSON.parse(payload)); } catch { return NextResponse.json({ error: "Dossier invalide." }, { status: 400 }); }
  } else body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const responseType = text(body, "response_type");
  if (!["beneficiary", "company"].includes(responseType)) return NextResponse.json({ error: "Type de dossier invalide." }, { status: 400 });
  const session = await findSession(clean);
  const formation = session ? null : await findFormation(clean);
  if (!session && !formation) return NextResponse.json({ error: "Lien introuvable ou expiré." }, { status: 404 });
  const needAnswers = jsonObject(body.need_answers);
  if (responseType === "beneficiary") {
    const beneficiarySiret = normalizeBeneficiarySiret(needAnswers.beneficiary_siret);
    const beneficiarySiretValidation = validateOptionalBeneficiarySiret(beneficiarySiret);
    if (!beneficiarySiretValidation.valid) {
      return NextResponse.json({ error: "Le SIRET doit comporter exactement 14 chiffres." }, { status: 400 });
    }
    needAnswers.beneficiary_siret = beneficiarySiretValidation.value;
  } else {
    delete needAnswers.beneficiary_siret;
  }
  let positioningAnswers = { ...jsonObject(body.positioning_answers) };
  for (const reserved of ["external_documents", "source_document_id", "source_sha256", "submission_fingerprint"]) delete positioningAnswers[reserved];
  const targetId = session?.id ?? formation?.id;
  if (!targetId) return NextResponse.json({ error: "Dossier de candidature introuvable." }, { status: 404 });
  const rawFormation = formation ?? (Array.isArray(session?.daily_formations) ? session.daily_formations[0] : session?.daily_formations);
  if (session && rawFormation && rawFormation.organisation_id !== session.organisation_id) throw new OwnPositioningError("Formation introuvable.", 404);
  const original = rawFormation ? await loadOriginalPositioning(getAdminSupabase(), rawFormation) : null;
  if (rawFormation?.positioning_mode === "off_platform" && !original) throw new OwnPositioningError("Le questionnaire de l’organisme doit être importé avant la candidature. Contactez votre organisme de formation.", 409);
  const ownSubmission = original ? await prepareOwnPositioning(body, formData, original, `${formation ? "formation" : "session"}:${targetId}`) : null;
  if (ownSubmission) {
    positioningAnswers = positioningSubmissionAnswers(ownSubmission);
  } else if (rawFormation?.positioning_mode === "selen") positioningAnswers = selenCandidatePositioningAnswers(body, rawFormation);
  const submission = ownSubmission ?? prepareJsonRegistrationSubmission(body, positioningAnswers, `${formation ? "formation" : "session"}:${targetId}`);
  positioningAnswers.submission_fingerprint = submission.fingerprint;
  const replay = await ownSubmissionReplay(submission, formation ? "formation" : "session", targetId, (formation ?? session)!.user_id);
  if (replay) return replay;
  const signature = buildApplicationSignature(request, body, targetId, responseType, needAnswers, positioningAnswers);
  if ("error" in signature) return NextResponse.json({ error: signature.error }, { status: 400 });
  const adaptationNeeded = hasExplicitAdaptationAnswer(needAnswers) || detectAdaptationNeeded(needAnswers);
  const supabase = getAdminSupabase();
  const signatureFields = { signature_consent_text: signature.value.consent_text, signature_data: signature.value.signature_data, signature_proof_hash: signature.value.proof_hash, signature_signed_at: signature.value.signed_at, signature_ip_address: signature.value.ip_address, signature_user_agent: signature.value.user_agent };
  const respondentEmail = text(body, "respondent_email").toLowerCase();
  const respondentFirstName = text(body, "respondent_first_name");

  if (formation) {
    const futureSessions = await findFutureSessions(formation.id);
    const publicSessions = futureSessions.filter((item) => !isAsynchronous(item));
    const asyncSession = futureSessions.find(isAsynchronous) ?? null;
    const requestedSessionId = text(body, "selected_session_id");
    let attachedSession: PublicSession | null = null;
    if (requestedSessionId) {
      attachedSession = publicSessions.find((item) => item.id === requestedSessionId) ?? null;
      if (!attachedSession) return NextResponse.json({ error: "La session choisie n'est plus disponible. Merci d'actualiser le dossier et de choisir une autre date." }, { status: 409 });
    } else if (publicSessions.length === 0 && asyncSession) attachedSession = asyncSession;
    const nextStep = attachedSession ? isAsynchronous(attachedSession) ? "asynchronous" : "scheduled" : "date_to_plan";
    if (ownSubmission) await persistOwnPositioning(supabase, ownSubmission, "formation", attachedSession?.id ?? null);
    const { data: response, error } = await supabase.from("daily_formation_registration_requests").insert({
      id: submission.id,
      formation_id: formation.id, user_id: formation.user_id, response_type: responseType,
      respondent_first_name: respondentFirstName || null, respondent_last_name: text(body, "respondent_last_name") || null, respondent_email: respondentEmail || null,
      company_name: responseType === "company" ? text(body, "company_name") || null : null, participants: responseType === "company" ? jsonArray(body.participants) : [],
      need_answers: needAnswers, positioning_answers: positioningAnswers, adaptation_needed: adaptationNeeded,
      attached_session_id: attachedSession?.id ?? null, status: attachedSession ? "attached" : "to_attach", submitted_at: signature.value.signed_at, ...signatureFields,
    }).select("id,status,attached_session_id,submitted_at,signature_signed_at").single();
    if (error) {
      const replay = await ownSubmissionReplay(submission, "formation", formation.id, formation.user_id); if (replay) return replay;
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await supabase.from("daily_formations").update({ spontaneous_registration_task_status: attachedSession ? "none" : "to_attach" }).eq("id", formation.id);
    const organisation = await findOrganisation(formation.user_id);
    const confirmation = await sendConfirmationSafely({ email: respondentEmail, firstName: respondentFirstName || null, organisationName: organisation?.name ?? null, formationTitle: formation.title, nextStep, sessionLabel: attachedSession ? sessionLabel(attachedSession) : null });
    return NextResponse.json({ response, summary: { task: attachedSession ? null : "Caler une date avec le formateur puis recontacter le candidat." }, registrationKind: "formation", nextStep, organisationName: organisation?.name ?? null, confirmationEmailSent: confirmation.sent });
  }

  if (!session) return NextResponse.json({ error: "Lien introuvable ou expiré." }, { status: 404 });
  if (ownSubmission) await persistOwnPositioning(supabase, ownSubmission, "session", session.id);
  const { data: response, error } = await supabase.from("daily_registration_responses").insert({
    id: submission.id,
    session_id: session.id, user_id: session.user_id, response_type: responseType, respondent_first_name: respondentFirstName || null,
    respondent_last_name: text(body, "respondent_last_name") || null, respondent_email: respondentEmail || null,
    company_name: responseType === "company" ? text(body, "company_name") || null : null, participants: responseType === "company" ? jsonArray(body.participants) : [],
    need_answers: needAnswers, positioning_answers: positioningAnswers, adaptation_needed: adaptationNeeded, status: "submitted", submitted_at: signature.value.signed_at, ...signatureFields,
  }).select("id,status,submitted_at,signature_signed_at").single();
  if (error) {
    const replay = await ownSubmissionReplay(submission, "session", session.id, session.user_id); if (replay) return replay;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data: responses } = await supabase.from("daily_registration_responses").select("response_type,respondent_first_name,respondent_last_name,company_name,need_answers,positioning_answers,adaptation_needed").eq("session_id", session.id).eq("status", "submitted");
  const summary = buildDailyRegistrationSummary(responses ?? []);
  const hasAdaptation = Boolean(session.adaptation_needed) || adaptationNeeded || summary.adaptation_needed;
  await supabase.from("daily_sessions").update({ registration_status: "summary_to_review", registration_summary: summary, adaptation_needed: hasAdaptation, registration_responses_received_at: signature.value.signed_at }).eq("id", session.id);
  const organisation = await findOrganisation(session.user_id);
  const legacyNextStep = session.modality === "distanciel" && session.distance_mode === "asynchrone" ? "asynchronous" : "scheduled";
  const legacyFormation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
  const confirmation = await sendConfirmationSafely({ email: respondentEmail, firstName: respondentFirstName || null, organisationName: organisation?.name ?? null, formationTitle: legacyFormation?.title ?? null, nextStep: legacyNextStep, sessionLabel: sessionLabel(session as unknown as PublicSession) });
  return NextResponse.json({ response, summary, nextStep: legacyNextStep, organisationName: organisation?.name ?? null, confirmationEmailSent: confirmation.sent });
  } catch (cause) { return NextResponse.json({ error: cause instanceof OwnPositioningError ? cause.message : "La candidature n’a pas pu être transmise." }, { status: cause instanceof OwnPositioningError ? cause.status : 500 }); }
}
