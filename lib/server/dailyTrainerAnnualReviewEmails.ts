import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export function prepareTrainerAnnualReviewManagerEmail(input: {
  managerName?: string | null;
  trainerName: string;
  reviewYear: number;
  reviewUrl: string;
}) {
  const salutation = input.managerName?.trim() ? `Bonjour ${input.managerName.trim()},` : "Bonjour,";
  const subject = `Auto-évaluation formateur complétée · ${input.trainerName}`;
  const text = [
    salutation,
    "",
    `${input.trainerName} a complété son auto-évaluation annuelle ${input.reviewYear}.`,
    "",
    "Vous pouvez en prendre connaissance dans Selen Daily :",
    input.reviewUrl,
    "",
    "Aucune validation n’est demandée pour le moment.",
    "",
    "Selen Editions",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
    <p>${escapeHtml(salutation)}</p>
    <p><strong>${escapeHtml(input.trainerName)}</strong> a complété son auto-évaluation annuelle ${input.reviewYear}.</p>
    <p><a href="${escapeHtml(input.reviewUrl)}" style="display:inline-block;padding:12px 18px;background:#8a4b24;color:#fffaf0;text-decoration:none;font-weight:700">Consulter le suivi formateur</a></p>
    <p>Aucune validation n’est demandée pour le moment.</p>
    <p>Selen Editions</p>
  </div>`;
  return { subject, text, html };
}

export async function sendTrainerAnnualReviewManagerEmail(input: {
  email: string;
  managerName?: string | null;
  trainerName: string;
  reviewYear: number;
  reviewUrl: string;
}) {
  if (!resend) {
    console.warn("RESEND_API_KEY absente : notification dirigeant auto-évaluation non envoyée.");
    return { sent: false as const, reason: "missing_resend_api_key" as const };
  }

  const message = prepareTrainerAnnualReviewManagerEmail(input);
  const { data, error } = await resend.emails.send({
    from: resendFromEmail,
    to: input.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: "hello@selen-editions.fr",
  });
  if (error) {
    console.error("Daily : notification dirigeant auto-évaluation impossible", error);
    return { sent: false as const, reason: "send_failed" as const };
  }
  return { sent: true as const, providerMessageId: data?.id ?? null };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
