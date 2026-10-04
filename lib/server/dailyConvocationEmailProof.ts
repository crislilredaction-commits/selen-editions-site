import { createHash } from "node:crypto";
import type { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { prepareDailyConvocationEmail, type DailyConvocationEmailInput, type sendDailyConvocation } from "@/lib/server/dailyPretrainingEmails";

type Admin = ReturnType<typeof getAdminSupabase>;
type Snapshot = { document_id: string; document_type: string; logical_name: string; document_version: number; storage_path: string; sha256: string | null };
type Input = {
  organisationId: string; sessionId: string; enrolmentId?: string; createdBy?: string;
  source: "daily_documents" | "daily_convocations"; documentId: string; version: number; email: string;
  storagePath: string; bucket: string; historical?: boolean; snapshot?: Snapshot;
  load: () => Promise<DailyConvocationEmailInput>;
  send: typeof sendDailyConvocation;
};
export type ConvocationProofResult = {
  status: "sent" | "already_sent" | "pending" | "rejected";
  communicationId?: string; sentAt?: string; sentTo?: string; reason?: string;
};

export function convocationOperationId(input: Pick<Input, "organisationId" | "sessionId" | "source" | "documentId" | "version" | "email">) {
  const hex = createHash("sha256").update(JSON.stringify(["daily-convocation-proof-v1", input.organisationId, input.sessionId, input.source, input.documentId, input.version, input.email])).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function proved(row: Record<string, any>) {
  return row.provider === "resend" && row.channel === "email"
    && ["sent", "delivered", "bounced"].includes(row.status)
    && typeof row.provider_message_id === "string" && !!row.provider_message_id.trim()
    && typeof row.sent_at === "string" && row.sent_at.includes("T") && Number.isFinite(Date.parse(row.sent_at));
}

/** queued is a permanent uncertainty barrier, never a timed lease. Only the owner
 * of a fresh INSERT or a bounded failed->queued CAS may call the provider. */
export async function deliverConvocationWithProof(admin: Admin, input: Input): Promise<ConvocationProofResult> {
  const id = convocationOperationId(input);
  const pending = (reason: string): ConvocationProofResult => ({ status: "pending", communicationId: id, reason });
  const key = input.source === "daily_documents" ? "document_id" : "convocation_id";
  const scoped = () => admin.from("daily_communications").select("*")
    .eq("organisation_id", input.organisationId).eq("session_id", input.sessionId)
    .eq("recipient_email", input.email).eq("communication_type", "convocation");
  try {
    const { data: history, error } = await scoped().contains("metadata", { [key]: input.documentId });
    if (error) return pending("history_unavailable");
    const rows = (history ?? []).filter((row) => row.metadata?.document_version == null || row.metadata.document_version === input.version);
    // Old incomplete evidence must never become an implicit permission to resend.
    const uncertain = rows.find((row) => row.id !== id && (!proved(row) || row.metadata?.document_version == null));
    if (uncertain) return pending("historical_evidence_incomplete");
    const previous = rows.find((row) => proved(row) && row.metadata?.document_version === input.version);
    if (previous && input.snapshot) {
      const { data: linked, error: linkError } = await admin.from("daily_communication_documents").select("*")
        .eq("communication_id", previous.id).eq("document_id", input.snapshot.document_id).maybeSingle();
      if (linkError || !linked || Object.entries(input.snapshot).some(([k, v]) => linked[k] !== v)) return pending("historical_snapshot_incomplete");
    }
    if (previous && input.source === "daily_convocations"
      && (previous.metadata?.storage_path !== input.storagePath || previous.metadata?.bucket !== input.bucket)) return pending("historical_snapshot_incomplete");
    if (previous) return { status: "already_sent", communicationId: previous.id, sentAt: previous.sent_at, sentTo: previous.recipient_email };
    let row = rows.find((item) => item.id === id);
    if (row && row.status !== "failed") return pending("confirmation_required");
    if (!row && input.historical) return pending("historical_evidence_incomplete");
    if (row) {
      if (!row.metadata?.retry_safe || row.metadata.attempt >= 2 || !row.metadata.email_input) return pending("confirmation_required");
      const { data, error: claimError } = await admin.from("daily_communications")
        .update({ status: "queued", metadata: { ...row.metadata, attempt: row.metadata.attempt + 1, retry_safe: false } })
        .eq("id", id).eq("status", "failed").eq("failed_at", row.failed_at)
        .contains("metadata", { attempt: row.metadata.attempt, retry_safe: true }).select("*").maybeSingle();
      if (claimError || !data) return pending("claim_not_acquired");
      row = data;
    } else {
      // Freeze both attachment bytes and rendered content before reserving this operation.
      // A failed load has not called the provider and can be retried safely.
      let emailInput: DailyConvocationEmailInput;
      try { emailInput = await input.load(); } catch { return { status: "rejected", reason: "attachment_unavailable" }; }
      const prepared = prepareDailyConvocationEmail(emailInput);
      const { data, error: claimError } = await admin.from("daily_communications").insert({
        id, organisation_id: input.organisationId, session_id: input.sessionId, enrolment_id: input.enrolmentId ?? null,
        created_by: input.createdBy ?? null, communication_type: "convocation", channel: "email", provider: "resend",
        recipient_email: input.email, recipient_name: emailInput.learnerName || null,
        subject: prepared.subject, text_body: prepared.text, html_body: prepared.html, status: "queued",
        metadata: { [key]: input.documentId, source: input.source, document_version: input.version,
          storage_path: input.storagePath, bucket: input.bucket, attachment_filename: emailInput.attachmentFilename,
          email_input: { ...emailInput, prepared }, snapshot: input.snapshot ?? null, attempt: 1, retry_safe: false },
      }).select("*").single();
      if (claimError || !data || data.id !== id) return pending("claim_not_acquired");
      row = data;
    }
    const failBeforeOrRejected = async (reason: string): Promise<ConvocationProofResult> => {
      const { data, error: failureError } = await admin.from("daily_communications").update({
        status: "failed", failed_at: new Date().toISOString(), failure_reason: reason,
        metadata: { ...row.metadata, retry_safe: true },
      }).eq("id", id).eq("status", "queued").select("id").maybeSingle();
      return failureError || !data ? pending("failure_not_recorded") : { status: "rejected", communicationId: id, reason };
    };
    const snapshot = row.metadata.snapshot as Snapshot | null;
    if (snapshot) {
      try {
        const { error: snapshotError } = await admin.from("daily_communication_documents")
          .upsert({ communication_id: id, ...snapshot }, { onConflict: "communication_id,document_id", ignoreDuplicates: true });
        if (snapshotError) return await failBeforeOrRejected("document_snapshot_failed");
        const { data: stored, error: readError } = await admin.from("daily_communication_documents").select("*")
          .eq("communication_id", id).eq("document_id", snapshot.document_id).maybeSingle();
        if (readError || !stored || Object.entries(snapshot).some(([k, v]) => stored[k] !== v)) return await failBeforeOrRejected("document_snapshot_failed");
      } catch { return await failBeforeOrRejected("document_snapshot_failed"); }
    }
    const result = await input.send({ ...row.metadata.email_input, idempotencyKey: `daily-convocation/${id}` });
    if (!result.sent) return result.definitive ? await failBeforeOrRejected(result.reason) : pending(result.reason);
    if (typeof result.message.providerMessageId !== "string" || !result.message.providerMessageId.trim()) return pending("provider_confirmation_missing");
    const sentAt = new Date().toISOString();
    const { data: finalized, error: finalizeError } = await admin.from("daily_communications").update({
      status: "sent", provider_message_id: result.message.providerMessageId, sent_at: sentAt, failed_at: null, failure_reason: null,
    }).eq("id", id).eq("status", "queued").select("id").maybeSingle();
    if (finalizeError || !finalized) return pending("evidence_not_recorded");
    const { data: evidence, error: evidenceError } = await scoped().eq("id", id).maybeSingle();
    if (evidenceError || !evidence || !proved(evidence) || evidence.provider_message_id !== result.message.providerMessageId || Date.parse(evidence.sent_at) !== Date.parse(sentAt)) return pending("evidence_not_confirmed");
    return { status: "sent", communicationId: id, sentAt: evidence.sent_at, sentTo: evidence.recipient_email };
  } catch { return pending("confirmation_required"); }
}
