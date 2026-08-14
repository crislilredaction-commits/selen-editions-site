import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export type DailyCertificateEmailSnapshot = {
  subject: string;
  text: string;
  html: string;
  providerMessageId: string | null;
};

export async function sendDailyCompletionCertificate(input: {
  email: string;
  learnerName: string;
  formationTitle: string;
  startDate: string;
  endDate: string;
  attachmentFilename: string;
  attachmentBase64: string;
}) {
  if (!resend) {
    console.warn("RESEND_API_KEY absente : certificat de réalisation Daily non envoyé.");
    return { sent: false as const, reason: "missing_resend_api_key" as const };
  }

  const subject = `Votre certificat de réalisation · ${input.formationTitle}`;
  const period = input.endDate && input.endDate !== input.startDate
    ? `du ${formatDate(input.startDate)} au ${formatDate(input.endDate)}`
    : `le ${formatDate(input.startDate)}`;
  const text = [
    `Bonjour ${input.learnerName || ""},`.trim(),
    "",
    `Vous trouverez en pièce jointe votre certificat de réalisation pour la formation « ${input.formationTitle} » ${period}.`,
    "",
    "Conservez ce document avec vos justificatifs de formation.",
    "",
    "Selen Editions",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
      <p>Bonjour ${escapeHtml(input.learnerName)},</p>
      <p>Vous trouverez en pièce jointe votre certificat de réalisation pour la formation <strong>${escapeHtml(input.formationTitle)}</strong> ${escapeHtml(period)}.</p>
      <p>Conservez ce document avec vos justificatifs de formation.</p>
      <p>Selen Editions</p>
    </div>`;

  const { data, error } = await resend.emails.send({
    from: resendFromEmail,
    to: input.email,
    subject,
    text,
    html,
    replyTo: "hello@selen-editions.fr",
    attachments: [{ content: input.attachmentBase64, filename: input.attachmentFilename }],
  });

  if (error) {
    console.error("Daily : envoi du certificat de réalisation impossible", error);
    return { sent: false as const, reason: "send_failed" as const };
  }

  return {
    sent: true as const,
    message: { subject, text, html, providerMessageId: data?.id ?? null } satisfies DailyCertificateEmailSnapshot,
  };
}

function formatDate(value: string) {
  if (!value) return "à la date indiquée sur le certificat";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
