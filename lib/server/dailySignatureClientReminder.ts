type AdminClient = any;

const REMINDER_TYPE = "daily_signature_pending_72h";
const OPEN_STATUSES = ["draft", "ready", "postponed"];
const SLA_MS = 72 * 60 * 60 * 1000;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeKey(signatureId: string) {
  return `daily-signature:${signatureId}:72h`;
}

export async function prepareDailySignatureReminder(admin: AdminClient, input: {
  organisationId: string;
  sessionId: string;
  signatureId: string;
  conventionId: string;
  documentName: string;
  signatoryType: string | null;
  signatoryName: string | null;
  signatoryEmail: string;
  sentAt: string;
}) {
  const dueAt = new Date(new Date(input.sentAt).getTime() + SLA_MS).toISOString();
  const key = dedupeKey(input.signatureId);

  const [{ data: existing }, { data: assignment }] = await Promise.all([
    admin.from("client_reminders")
      .select("id,status,due_at")
      .eq("dedupe_key", key)
      .in("status", OPEN_STATUSES)
      .limit(1)
      .maybeSingle(),
    admin.from("daily_organisation_assignments")
      .select("agent_profile_id")
      .eq("organisation_id", input.organisationId)
      .maybeSingle(),
  ]);

  if (existing) return { id: existing.id, dueAt: existing.due_at, alreadyPrepared: true };

  const stakeholder = text(input.signatoryType) || "partie_prenante";
  const documentName = text(input.documentName) || "Document à signer";
  const signatoryName = text(input.signatoryName) || input.signatoryEmail;
  const reason = `${documentName} : signature attendue de ${signatoryName}.`;

  const { data, error } = await admin.from("client_reminders").insert({
    client_email: input.signatoryEmail,
    reminder_type: REMINDER_TYPE,
    status: "postponed",
    subject: `Signature attendue · ${documentName}`,
    body_html: `<p>${reason}</p>`,
    body_text: reason,
    due_at: dueAt,
    dedupe_key: key,
    prestation_type: "daily_session",
    prestation_id: input.sessionId,
    stage_label: "Signature attendue",
    expected_action: "Signer le document",
    metadata: {
      source: "daily_signature",
      organisation_id: input.organisationId,
      session_id: input.sessionId,
      convention_id: input.conventionId,
      signature_id: input.signatureId,
      document_name: documentName,
      stakeholder_type: stakeholder,
      signatory_name: signatoryName,
      sent_at: input.sentAt,
      queued_at: input.sentAt,
      assigned_agent_profile_id: assignment?.agent_profile_id ?? null,
      reason,
    },
  }).select("id,due_at").single();

  if (error) throw new Error(error.message);
  return { id: data.id, dueAt: data.due_at, alreadyPrepared: false };
}

export async function resolveDailySignatureReminder(admin: AdminClient, signatureId: string, resolvedAt: string) {
  const { error } = await admin.from("client_reminders")
    .update({
      status: "resolved",
      metadata: { resolved_by: "signature_recorded", resolved_at: resolvedAt },
    })
    .eq("dedupe_key", dedupeKey(signatureId))
    .in("status", OPEN_STATUSES);
  if (error) throw new Error(error.message);
}
