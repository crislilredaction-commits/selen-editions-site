type AdminClient = any;

const REMINDER_TYPE = "daily_signature_pending_72h";
const ACTIVE_STATUSES = ["draft", "ready", "postponed"];
const SLA_MS = 72 * 60 * 60 * 1000;

function clean(value: unknown) {
  return String(value ?? "").trim();
}
function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function dedupeKey(signatureId: string) {
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

  const dueAt = new Date(new Date(input.sentAt).getTime() + SLA_MS).toISOString();
  const actor = clean(input.signatoryName) || clean(input.signatoryEmail) || "Partie prenante";
  const document = clean(input.documentName) || "document de formation";
  const subject = `Signature attendue — ${document}`;
  const bodyText = `${actor} doit encore signer ${document}. Relance à effectuer si la signature n’est pas reçue.`;

  const { data: reminder, error } = await admin.from("client_reminders").insert({
    client_email: clean(input.signatoryEmail).toLowerCase(),
    dossier_id: dossier?.id ?? null,
    reminder_type: REMINDER_TYPE,
    status: "ready",
    subject,
    body_html: `<p>${escapeHtml(bodyText)}</p>`,
    body_text: bodyText,
    due_at: dueAt,
    dedupe_key: key,
    prestation_type: "daily_signature",
    prestation_id: input.signatureId,
    stage_label: "Signature attendue",
    expected_action: "Obtenir la signature du document envoyé",
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

export async function resolveDailySignatureFollowupReminder(admin: AdminClient, signatureId: string, resolvedAt = new Date().toISOString()) {
  const { error } = await admin.from("client_reminders").update({ status: "resolved", updated_at: resolvedAt }).eq("dedupe_key", dedupeKey(signatureId)).in("status", ACTIVE_STATUSES);
  if (error) throw new Error(error.message);
}
