import { deliverLearnerEmail, emailDeliveryId } from "@/lib/server/dailyLearnerEmailDelivery";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Admin = ReturnType<typeof getAdminSupabase>;
type MessageInput = { title: string; content?: string | null; organisationName?: string | null; recipientName?: string | null; linkPath: string };

export function dailyAgentTaskUrl(path: string) {
  const url = new URL(path, "https://studio.selen-editions.fr");
  if (url.origin !== "https://studio.selen-editions.fr" || !url.pathname.startsWith("/agent/daily/")) throw new Error("Lien de tâche Studio invalide.");
  return url.toString();
}

export function prepareDailyAgentTaskEmail(input: MessageInput) {
  const recipient = input.recipientName?.trim() || "l’équipe Selen";
  const organisation = input.organisationName?.trim() || "un organisme Selen Daily";
  const detail = input.content?.trim() || input.title;
  const url = dailyAgentTaskUrl(input.linkPath);
  const subject = `Action Selen Daily · ${input.title}`;
  const text = [`Bonjour ${recipient},`, "", `Une action nécessite votre attention pour ${organisation}.`, "", input.title, detail, "", `Ouvrir la tâche dans Selen Studio : ${url}`, "", "Selen Editions"].join("\n");
  const html = `<div lang="fr" style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px"><p>Bonjour ${escapeHtml(recipient)},</p><p>Une action nécessite votre attention pour <strong>${escapeHtml(organisation)}</strong>.</p><p><strong>${escapeHtml(input.title)}</strong><br />${escapeHtml(detail)}</p><p><a href="${escapeHtml(url)}">Ouvrir la tâche dans Selen Studio</a></p><p>Selen Editions</p></div>`;
  return { subject, text, html };
}

export async function sendDailyAgentTaskEmail(admin: Admin, input: MessageInput & {
  email: string; organisationId: string; sessionId?: string | null; notificationId: string; eventAt: string; sourceKey: string;
}) {
  const key = `daily-agent-task-v1/${input.organisationId}/${input.notificationId}/${input.eventAt}/${input.email}`;
  const message = prepareDailyAgentTaskEmail(input);
  const result = await deliverLearnerEmail(admin, {
    key, pendingOnAmbiguousError: true, preparationSubject: message.subject,
    row: { organisation_id: input.organisationId, session_id: input.sessionId ?? null, communication_type: "agent_task", channel: "email", provider: "resend", recipient_email: input.email, recipient_name: input.recipientName ?? null, text_body: "", metadata: { notification_id: input.notificationId, source_key: input.sourceKey, event_at: input.eventAt, link_path: input.linkPath } },
    message: async () => message,
  });
  if (!["sent", "already_sent"].includes(result.status)) return result;
  const { data: proof, error } = await admin.from("daily_communications").select("id,status,provider,channel,provider_message_id,sent_at,metadata")
    .eq("id", emailDeliveryId(key)).eq("organisation_id", input.organisationId).eq("recipient_email", input.email).eq("communication_type", "agent_task").maybeSingle();
  if (error || !proof || proof.provider !== "resend" || proof.channel !== "email" || !["sent", "delivered", "bounced"].includes(proof.status)
    || typeof proof.provider_message_id !== "string" || !proof.provider_message_id.trim() || typeof proof.sent_at !== "string" || !Number.isFinite(Date.parse(proof.sent_at))
    || proof.metadata?.notification_id !== input.notificationId || proof.metadata?.event_at !== input.eventAt) return { ...result, status: "pending" as const };
  return { ...result, sentAt: proof.sent_at as string };
}

function escapeHtml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
