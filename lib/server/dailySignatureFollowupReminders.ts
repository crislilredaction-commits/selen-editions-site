type AdminClient = any;

export const DAILY_SIGNATURE_REMINDER_TYPE = "daily_signature_pending_72h";
export const DAILY_SIGNATURE_J3_STAGE = "automatic_email_j3";
export const DAILY_SIGNATURE_J6_STAGE = "automatic_email_j6";
export const DAILY_SIGNATURE_J9_STAGE = "phone_call_j9";
export const DAILY_SIGNATURE_URGENT_STAGE = "agent_urgent_before_start";
const ACTIVE_STATUSES = ["draft", "ready", "postponed"];
const J3_MS = 3 * 24 * 60 * 60 * 1000;
const J6_MS = 6 * 24 * 60 * 60 * 1000;
const J9_MS = 9 * 24 * 60 * 60 * 1000;

function clean(value: unknown) {
  return String(value ?? "").trim();
}
function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function dedupeKey(signatureId: string) {
  // Clé historique conservée volontairement pour ne pas recréer un rappel parallèle lors du passage H+72 -> J+3/J+6.
  return `daily:signature:${signatureId}:pending-72h`;
}

function dueAt(initialSentAt: string, delayMs: number) {
  return new Date(new Date(initialSentAt).getTime() + delayMs).toISOString();
}

function startsBefore(sessionStartDate: string | null | undefined, nextDueAt: string) {
  if (!sessionStartDate) return false;
  const start = new Date(sessionStartDate).getTime();
  const due = new Date(nextDueAt).getTime();
  return Number.isFinite(start) && Number.isFinite(due) && start < due;
}

function urgentFields(document: string, now: string) {
  return {
    status: "ready",
    due_at: now,
    subject: `Urgent avant démarrage — ${document}`,
    body_html: `<p>${escapeHtml(`La formation commence avant la prochaine relance planifiée. Un agent doit contacter le signataire de ${document} sans attendre.`)}</p>`,
    body_text: `La formation commence avant la prochaine relance planifiée. Un agent doit contacter le signataire de ${document} sans attendre.`,
    stage_label: "Signature urgente avant démarrage",
    expected_action: "Contacter immédiatement le signataire et sécuriser la signature",
  };
}

export async function ensureDailySignatureFollowupReminder(admin: AdminClient, input: {
  organisationId: string;
  sessionId: string;
  conventionId: string;
  signatureId: string;
  signatoryType?: string | null;
  signatoryName?: string | null;
  signatoryEmail: string;
  documentName?: string | null;
  sentAt: string;
}) {
  const key = dedupeKey(input.signatureId);
  const { data: existing, error: existingError } = await admin.from("client_reminders").select("id,status,due_at").eq("dedupe_key", key).in("status", ACTIVE_STATUSES).limit(1).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return { created: false, reminder: existing };

  const [{ data: assignment, error: assignmentError }, { data: dossier, error: dossierError }, { data: session, error: sessionError }] = await Promise.all([
    admin.from("daily_organisation_assignments").select("agent_profile_id").eq("organisation_id", input.organisationId).maybeSingle(),
    admin.from("daily_session_dossiers").select("id").eq("organisation_id", input.organisationId).eq("session_id", input.sessionId).maybeSingle(),
    admin.from("daily_sessions").select("id,start_date").eq("id", input.sessionId).eq("organisation_id", input.organisationId).maybeSingle(),
  ]);
  if (assignmentError) throw new Error(assignmentError.message);
  if (dossierError) throw new Error(dossierError.message);
  if (sessionError) throw new Error(sessionError.message);

  const j3DueAt = dueAt(input.sentAt, J3_MS);
  const actor = clean(input.signatoryName) || clean(input.signatoryEmail) || "Partie prenante";
  const document = clean(input.documentName) || "document de formation";
  const urgent = startsBefore(session?.start_date, j3DueAt);
  const now = new Date().toISOString();
  const subject = `Signature attendue — ${document}`;
  const bodyText = `${actor} doit encore signer ${document}. Une relance email automatique est prévue à J+3 si la signature n’est pas reçue.`;

  const { data: reminder, error } = await admin.from("client_reminders").insert({
    client_email: clean(input.signatoryEmail).toLowerCase(),
    dossier_id: dossier?.id ?? null,
    reminder_type: DAILY_SIGNATURE_REMINDER_TYPE,
    ...(urgent ? urgentFields(document, now) : {
      status: "ready",
      subject,
      body_html: `<p>${escapeHtml(bodyText)}</p>`,
      body_text: bodyText,
      due_at: j3DueAt,
      stage_label: "Relance email automatique J+3",
      expected_action: "Attendre la relance automatique ou la signature",
    }),
    dedupe_key: key,
    prestation_type: "daily_signature",
    prestation_id: input.signatureId,
    metadata: {
      source: "daily",
      organisation_id: input.organisationId,
      session_id: input.sessionId,
      convention_id: input.conventionId,
      signature_id: input.signatureId,
      signatory_type: clean(input.signatoryType) || null,
      signatory_name: clean(input.signatoryName) || null,
      assigned_agent_profile_id: assignment?.agent_profile_id ?? null,
      queued_at: input.sentAt,
      sent_at: input.sentAt,
      initial_sent_at: input.sentAt,
      followup_stage: urgent ? DAILY_SIGNATURE_URGENT_STAGE : DAILY_SIGNATURE_J3_STAGE,
      session_start_date: session?.start_date ?? null,
      action_href: `/agent/daily/session-dossiers/${encodeURIComponent(input.sessionId)}/followup`,
      reason: `Signature attendue pour ${document}`,
    },
  }).select("id,status,due_at").single();

  if (error) {
    if (error.code === "23505") {
      const { data: concurrent } = await admin.from("client_reminders").select("id,status,due_at").eq("dedupe_key", key).in("status", ACTIVE_STATUSES).limit(1).maybeSingle();
      if (concurrent) return { created: false, reminder: concurrent };
    }
    throw new Error(error.message);
  }
  return { created: true, reminder };
}

export async function moveDailySignatureReminderToNextStage(admin: AdminClient, input: {
  reminderId: string;
  initialSentAt: string;
  documentName?: string | null;
  automaticEmailSentAt: string;
  completedStage: typeof DAILY_SIGNATURE_J3_STAGE | typeof DAILY_SIGNATURE_J6_STAGE;
  sessionId: string;
  sessionStartDate?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const document = clean(input.documentName) || "document de formation";
  const nextStage = input.completedStage === DAILY_SIGNATURE_J3_STAGE ? DAILY_SIGNATURE_J6_STAGE : DAILY_SIGNATURE_J9_STAGE;
  const nextDueAt = dueAt(input.initialSentAt, nextStage === DAILY_SIGNATURE_J6_STAGE ? J6_MS : J9_MS);
  const now = new Date().toISOString();
  const urgent = startsBefore(input.sessionStartDate, nextDueAt);
  const automatic = nextStage === DAILY_SIGNATURE_J6_STAGE;
  const bodyText = automatic
    ? `La relance email automatique J+3 a été envoyée. Une seconde relance automatique est prévue à J+6 si ${document} reste non signé.`
    : `Les relances automatiques J+3 et J+6 ont été envoyées. Si ${document} reste non signé à J+9, un agent doit contacter le client.`;
  const fields = urgent ? urgentFields(document, now) : {
    status: automatic ? "postponed" : "ready",
    due_at: nextDueAt,
    subject: automatic ? `Relance automatique J+6 — ${document}` : `Appel à effectuer à J+9 — ${document}`,
    body_html: `<p>${escapeHtml(bodyText)}</p>`,
    body_text: bodyText,
    stage_label: automatic ? "Relance email automatique J+6" : "Appel téléphonique agent J+9",
    expected_action: automatic ? "Attendre la seconde relance automatique ou la signature" : "Appeler le client si la signature est toujours absente",
  };
  const { error } = await admin.from("client_reminders").update({
    ...fields,
    metadata: {
      ...(input.metadata ?? {}),
      followup_stage: urgent ? DAILY_SIGNATURE_URGENT_STAGE : nextStage,
      initial_sent_at: input.initialSentAt,
      [`${input.completedStage}_sent_at`]: input.automaticEmailSentAt,
      session_start_date: input.sessionStartDate ?? null,
      action_href: `/agent/daily/session-dossiers/${encodeURIComponent(input.sessionId)}/followup`,
      reason: urgent
        ? `Signature urgente avant le démarrage de la formation pour ${document}`
        : automatic
          ? `Seconde relance automatique prévue si ${document} reste non signé`
          : `Appel téléphonique à effectuer si ${document} reste non signé`,
    },
  }).eq("id", input.reminderId).eq("status", "draft");
  if (error) throw new Error(error.message);
  return { dueAt: urgent ? now : nextDueAt, stage: urgent ? DAILY_SIGNATURE_URGENT_STAGE : nextStage };
}

export async function resolveDailySignatureFollowupReminder(admin: AdminClient, signatureId: string, resolvedAt = new Date().toISOString()) {
  const { error } = await admin.from("client_reminders").update({ status: "resolved", updated_at: resolvedAt }).eq("dedupe_key", dedupeKey(signatureId)).in("status", ACTIVE_STATUSES);
  if (error) throw new Error(error.message);
}
