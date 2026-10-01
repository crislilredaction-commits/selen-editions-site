import { createHash, randomUUID } from "node:crypto";
import { Resend } from "resend";
const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const from = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
type Message = { subject: string; text: string; html: string };
export type DeliveryStatus = "sent" | "already_sent" | "pending" | "send_failed";
export function provenDelivery(row: any): DeliveryStatus {
  if (["sent", "delivered"].includes(row.status) && row.provider_message_id && row.sent_at) return "already_sent";
  return row.status === "failed" || row.status === "bounced" ? "send_failed" : "pending";
}
// The primary-key claim is durable, including across workers. An uncertain send is
// never retried automatically: Resend's idempotency window is finite.
export async function deliverLearnerEmail(admin: any, input: {
  key: string; force?: boolean; row: Record<string, unknown>; message: () => Promise<Message>;
}): Promise<{ status: DeliveryStatus; communicationId: string }> {
  const hash = createHash("sha256").update(input.key).digest("hex");
  const id = input.force ? randomUUID() : `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  let savedMessage: Message | undefined;
  const result = (status: DeliveryStatus) => ({ status, communicationId: id });
  const { data: claim, error: claimError } = await admin.from("daily_communications").insert({ ...input.row, id, subject: "Notification apprenant en préparation", status: "queued" }).select("id").single();
  if (!claimError && !claim) return result("send_failed");
  if (claimError) {
    if (claimError.code !== "23505") return result("send_failed");
    const { data: previous, error } = await admin.from("daily_communications").select("id,status,provider_message_id,sent_at,subject,text_body,html_body").eq("id", id).maybeSingle();
    if (error || !previous) return result("send_failed");
    if (previous.text_body && previous.html_body) savedMessage = { subject: previous.subject, text: previous.text_body, html: previous.html_body };
    // Only a definitely rejected / not attempted delivery may be reclaimed.
    if (previous.status !== "failed") return result(provenDelivery(previous));
    const { data: claimed, error: retryError } = await admin.from("daily_communications").update({ status: "queued", failed_at: null, failure_reason: null }).eq("id", id).eq("status", "failed").select("id").maybeSingle();
    if (retryError || !claimed) return result("pending");
  }
  const fail = async (reason: string) => {
    await admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: reason }).eq("id", id);
    return result("send_failed");
  };
  if (!resend) return fail("missing_resend_api_key");
  let message: Message;
  try { message = savedMessage ?? await input.message(); } catch { return fail("message_or_auth_failed"); }
  const { data: saved, error: saveError } = await admin.from("daily_communications").update({ subject: message.subject, text_body: message.text, html_body: message.html }).eq("id", id).select("id").maybeSingle();
  if (saveError || !saved) return fail("message_evidence_failed");
  let response;
  try {
    response = await resend.emails.send({ from, to: String(input.row.recipient_email), ...message, replyTo: "hello@selen-editions.fr" }, { idempotencyKey: id });
  } catch {
    // Transport failure: the provider may have accepted the email.
    return result("pending");
  }
  if (response.error) {
    // Validation rejection is definitive. Other provider errors can be ambiguous.
    if (["validation_error", "missing_required_field", "invalid_access", "restricted_api_key"].includes(response.error.name)) return fail("provider_rejected");
    return result("send_failed");
  }
  if (!response.data?.id) return result("pending");
  const sentAt = new Date().toISOString();
  const { data: evidence, error: evidenceError } = await admin.from("daily_communications").update({ provider_message_id: response.data.id, status: "sent", sent_at: sentAt, failed_at: null, failure_reason: null }).eq("id", id).select("id").maybeSingle();
  return result(evidenceError || !evidence ? "pending" : "sent");
}
