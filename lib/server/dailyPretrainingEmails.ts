import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export type DailyPretrainingEmailSnapshot = {
  subject: string;
  text: string;
  html: string;
  providerMessageId: string | null;
};

type DailyConvocationEmailInput = {
  email: string;
  learnerName: string;
  formationTitle: string;
  sessionReference: string;
  startDate: string;
  endDate: string;
  documentVersion: number;
  attachmentFilename: string;
  attachmentBase64: string;
};

export function prepareDailyConvocationEmail(input: DailyConvocationEmailInput) {
  const subject = `Votre convocation · ${input.formationTitle}`;
  const period = input.endDate && input.endDate !== input.startDate
    ? `du ${formatDate(input.startDate)} au ${formatDate(input.endDate)}`
    : `le ${formatDate(input.startDate)}`;
  const text = [
    `Bonjour ${input.learnerName || ""},`.trim(),
    "",
    `Vous trouverez en pièce jointe votre convocation pour la formation « ${input.formationTitle} » ${period}.`,
    input.sessionReference ? `Référence de session : ${input.sessionReference}` : "",
    "",
    "Conservez ce document : il reprend les informations utiles pour votre participation.",
    "",
    "Selen Editions",
  ].filter((line) => line !== "").join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
      <p>Bonjour ${escapeHtml(input.learnerName)},</p>
      <p>Vous trouverez en pièce jointe votre convocation pour la formation <strong>${escapeHtml(input.formationTitle)}</strong> ${escapeHtml(period)}.</p>
      ${input.sessionReference ? `<p>Référence de session : ${escapeHtml(input.sessionReference)}</p>` : ""}
      <p>Conservez ce document : il reprend les informations utiles pour votre participation.</p>
      <p>Selen Editions</p>
    </div>`;
  return { subject, text, html };
}

export async function sendDailyConvocation(input: DailyConvocationEmailInput) {
  if (!resend) {
    console.warn("RESEND_API_KEY absente : convocation Daily non envoyée.");
    return { sent: false as const, reason: "missing_resend_api_key" as const };
  }

  const message = prepareDailyConvocationEmail(input);
  const { data, error } = await resend.emails.send({
    from: resendFromEmail,
    to: input.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: "hello@selen-editions.fr",
    attachments: [
      {
        content: input.attachmentBase64,
        filename: input.attachmentFilename,
      },
    ],
  });

  if (error) {
    console.error("Daily : envoi de la convocation impossible", error);
    return { sent: false as const, reason: "send_failed" as const };
  }

  return {
    sent: true as const,
    message: {
      ...message,
      providerMessageId: data?.id ?? null,
    } satisfies DailyPretrainingEmailSnapshot,
  };
}

function formatDate(value: string) {
  if (!value) return "à la date indiquée sur la convocation";
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
