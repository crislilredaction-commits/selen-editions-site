type AdminClient = any;

export const DAILY_SIGNATURE_REMINDER_TYPE = "daily_signature_pending_72h";
export const DAILY_SIGNATURE_J3_STAGE = "automatic_email_j3";
export const DAILY_SIGNATURE_J6_STAGE = "phone_call_j6";
const ACTIVE_STATUSES = ["draft", "ready", "postponed"];
const J3_MS = 3 * 24 * 60 * 60 * 1000;
const J6_MS = 6 * 24 * 60 * 60 * 1000;

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

  const [{ data: assignment, error: assignmentError }, { data: dossier, error: dossierError }] = await Promise.all([
    admin.from("daily_organisation_assignments").select("agent_profile_id").eq("organisation_id", input.organisationId).maybeSingle(),
    admin.from("daily_session_dossiers").select("id").eq("organisation_id", input.organisationId).eq("session_id", input.sessionId).maybeSingle(),
  ]);
  if (assignmentError) throw new Error(assignmentError.message);
  if (dossierError) throw new Error(dossierError.message);

  const initialSentAt = new Date(input.sentAt);
  const dueAt = new Date(initialSentAt.getTime() + J3_MS).toISOString();
  const actor = clean(input.signatoryName) || clean(input.signatoryEmail) || "Partie prenante";
  const document = clean(input.documentName) || "document de formation";
  const subject = `Signature attendue — ${document}`;
  const bodyText = `${actor} doit encore signer ${document}. Une relance email automatique est prévue à J+3 si la signature n’est pas reçue.`;

  const { data: reminder, error } = await admin.from("client_reminders").insert({
    client_email: clean(input.signatoryEmail).toLowerCase(),
    dossier_id: dossier?.id ?? null,
    reminder_type: DAILY_SIGNATURE_REMINDER_TYPE,
    status: "ready",
    subject,
    body_html: `<p>${escapeHtml(bodyText)}</p>`,
    body_text: bodyText,
    due_at: dueAt,
    dedupe_key: key,
    prestation_type: "daily_signature",
    prestation_id: input.signatureId,
    stage_label: "Relance email automatique J+3",
    expected_action: "Attendre la relance automatique ou la signature",
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
      followup_stage: DAILY_SIGNATURE_J3_STAGE,
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

export async function moveDailySignatureReminderToPhoneCall(admin: AdminClient, input: {
  reminderId: string;
  initialSentAt: string;
  documentName?: string | null;
  automaticEmailSentAt: string;
}) {
  const initial = new Date(input.initialSentAt);
  const dueAt = new Date(initial.getTime() + J6_MS).toISOString();
  const document = clean(input.documentName) || "document de formation";
  const bodyText = `La relance email automatique J+3 a été envoyée. Si ${document} reste non signé à J+6, un agent doit appeler le client.`;
  const { error } = await admin.from("client_reminders").update({
    status: "postponed",
    due_at: dueAt,
    subject: `Appel à effectuer à J+6 — ${document}`,
    body_html: `<p>${escapeHtml(bodyText)}</p>`,
    body_text: bodyText,
    stage_label: "Appel téléphonique agent J+6",
    expected_action: "Appeler le client si la signature est toujours absente",
    metadata: {
      // Le JSON complet est reconstruit par l'exécuteur à partir des métadonnées existantes.
      followup_stage: DAILY_SIGNATURE_J6_STAGE,
      initial_sent_at: input.initialSentAt,
      automatic_email_sent_at: input.automaticEmailSentAt,
      reason: `Appel téléphonique à effectuer si ${document} reste non signé`,
    },
  }).eq("id", input.reminderId).in("status", ["ready", "postponed"]);
  if (error) throw new Error(error.message);
  return { dueAt };
}

export async function resolveDailySignatureFollowupReminder(admin: AdminClient, signatureId: string, resolvedAt = new Date().toISOString()) {
  const { error } = await admin.from("client_reminders").update({ status: "resolved", updated_at: resolvedAt }).eq("dedupe_key", dedupeKey(signatureId)).in("status", ACTIVE_STATUSES);
  if (error) throw new Error(error.message);
}
