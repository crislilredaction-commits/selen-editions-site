import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export type DailyAgentTaskEmailInput = {
  email: string | string[];
  recipientName?: string | null;
  title: string;
  content?: string | null;
  organisationName?: string | null;
};

export function prepareDailyAgentTaskEmail(input: DailyAgentTaskEmailInput) {
  const recipient = input.recipientName?.trim() || "l’équipe";
  const organisation = input.organisationName?.trim() || "un organisme Selen Daily";
  const detail = input.content?.trim() || input.title;
  const subject = `Action Selen Daily · ${input.title}`;
  const text = [
    `Bonjour ${recipient},`,
    "",
    `Une action nécessite votre attention pour ${organisation}.`,
    "",
    input.title,
    detail,
    "",
    "Retrouvez cette tâche dans Selen Studio.",
    "",
    "Selen Editions",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
    <p>Bonjour ${escapeHtml(recipient)},</p>
    <p>Une action nécessite votre attention pour <strong>${escapeHtml(organisation)}</strong>.</p>
    <p><strong>${escapeHtml(input.title)}</strong><br />${escapeHtml(detail)}</p>
    <p>Retrouvez cette tâche dans Selen Studio.</p>
    <p>Selen Editions</p>
  </div>`;
  return { subject, text, html };
}

export async function sendDailyAgentTaskEmail(input: DailyAgentTaskEmailInput) {
  if (!resend) return { sent: false as const, reason: "missing_resend_api_key" as const };
  const message = prepareDailyAgentTaskEmail(input);
  const { data, error } = await resend.emails.send({
    from: resendFromEmail,
    to: input.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: "hello@selen-editions.fr",
  });
  if (error) return { sent: false as const, reason: "send_failed" as const };
  return { sent: true as const, message: { ...message, providerMessageId: data?.id ?? null } };
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
