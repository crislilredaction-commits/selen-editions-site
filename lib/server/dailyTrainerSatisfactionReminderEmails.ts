import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

type Input = {
  email: string;
  trainerName: string;
  formationTitle: string;
  learnerCount: number;
  workspaceUrl?: string | null;
};

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function prepareDailyTrainerSatisfactionReminder(input: Input) {
  const subject = `Satisfaction apprenants à compléter · ${input.formationTitle}`;
  const countLabel = `${input.learnerCount} apprenant${input.learnerCount > 1 ? "s" : ""}`;
  const text = [
    `Bonjour ${input.trainerName || ""},`.trim(),
    "",
    `La session « ${input.formationTitle} » se termine bientôt. Le questionnaire de satisfaction est maintenant disponible pour ${countLabel}.`,
    "Merci de leur rappeler de le compléter avant leur départ.",
    input.workspaceUrl ? "" : null,
    input.workspaceUrl ? "Suivi de la session :" : null,
    input.workspaceUrl || null,
    "",
    "Selen Editions",
  ].filter((line): line is string => line !== null).join("\n");
  const action = input.workspaceUrl
    ? `<p><a href="${escapeHtml(input.workspaceUrl)}" style="display:inline-block;padding:12px 18px;background:#8a4b24;color:#fffaf0;text-decoration:none;font-weight:700">Ouvrir le suivi de la session</a></p>`
    : "";
  const html = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
    <p>Bonjour ${escapeHtml(input.trainerName)},</p>
    <p>La session « ${escapeHtml(input.formationTitle)} » se termine bientôt. Le questionnaire de satisfaction est maintenant disponible pour <strong>${escapeHtml(countLabel)}</strong>.</p>
    <p>Merci de leur rappeler de le compléter avant leur départ.</p>
    ${action}
    <p>Selen Editions</p>
  </div>`;
  return { subject, text, html };
}

export async function sendDailyTrainerSatisfactionReminder(input: Input) {
  if (!resend) return { sent: false as const, reason: "missing_resend_api_key" as const };
  const message = prepareDailyTrainerSatisfactionReminder(input);
  const { data, error } = await resend.emails.send({
    from: resendFromEmail,
    to: input.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: "hello@selen-editions.fr",
  });
  if (error) {
    console.error("Daily : rappel satisfaction formateur impossible", error);
    return { sent: false as const, reason: "send_failed" as const };
  }
  return { sent: true as const, message: { ...message, providerMessageId: data?.id ?? null } };
}
