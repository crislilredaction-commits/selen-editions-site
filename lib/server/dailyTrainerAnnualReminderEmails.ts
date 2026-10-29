import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

type ReminderInput = {
  email: string;
  trainerName?: string | null;
  actionUrl: string;
  year?: number;
};

export function prepareTrainerAnnualReviewReminderEmail(input: ReminderInput) {
  const name = input.trainerName?.trim();
  const salutation = name ? `Bonjour ${name},` : "Bonjour,";
  const year = input.year ?? new Date().getUTCFullYear();
  const subject = `Votre auto-évaluation annuelle ${year} · Selen Daily`;
  const text = [
    salutation,
    "",
    `Votre auto-évaluation formateur ${year} reste à compléter dans Selen Daily.`,
    "Elle permet à votre organisme de garder une trace simple de vos compétences, de vos besoins d'amélioration et des formations suivies ou envisagées.",
    "",
    "Compléter mon auto-évaluation :",
    input.actionUrl,
    "",
    "Selen vous relancera tant que ce point annuel n'est pas terminé.",
    "",
    "Selen Editions",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
    <p>${escapeHtml(salutation)}</p>
    <p>Votre auto-évaluation formateur <strong>${year}</strong> reste à compléter dans Selen Daily.</p>
    <p>Elle permet à votre organisme de garder une trace simple de vos compétences, de vos besoins d'amélioration et des formations suivies ou envisagées.</p>
    <p><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:12px 18px;background:#8a4b24;color:#fffaf0;text-decoration:none;font-weight:700">Compléter mon auto-évaluation</a></p>
    <p style="font-size:13px">Selen vous relancera tant que ce point annuel n'est pas terminé.</p>
    <p>Selen Editions</p>
  </div>`;
  return { subject, text, html };
}

export function prepareTrainerCvReminderEmail(input: ReminderInput) {
  const name = input.trainerName?.trim();
  const salutation = name ? `Bonjour ${name},` : "Bonjour,";
  const subject = "Mise à jour annuelle de votre CV · Selen Daily";
  const text = [
    salutation,
    "",
    "Votre CV formateur doit être actualisé dans Selen Daily.",
    "Une mise à jour annuelle suffit et les anciennes versions restent conservées dans votre dossier.",
    "",
    "Mettre à jour mon CV :",
    input.actionUrl,
    "",
    "Selen vous relancera tant que la mise à jour n'est pas terminée.",
    "",
    "Selen Editions",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
    <p>${escapeHtml(salutation)}</p>
    <p>Votre CV formateur doit être actualisé dans Selen Daily.</p>
    <p>Une mise à jour annuelle suffit et les anciennes versions restent conservées dans votre dossier.</p>
    <p><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:12px 18px;background:#8a4b24;color:#fffaf0;text-decoration:none;font-weight:700">Mettre à jour mon CV</a></p>
    <p style="font-size:13px">Selen vous relancera tant que la mise à jour n'est pas terminée.</p>
    <p>Selen Editions</p>
  </div>`;
  return { subject, text, html };
}

export async function sendTrainerAnnualReminder(
  input: ReminderInput & { kind: "annual_review" | "cv" },
) {
  if (!resend) {
    console.warn("RESEND_API_KEY absente : relance annuelle formateur non envoyée.");
    return { sent: false as const, reason: "missing_resend_api_key" as const };
  }

  const message = input.kind === "annual_review"
    ? prepareTrainerAnnualReviewReminderEmail(input)
    : prepareTrainerCvReminderEmail(input);
  const { data, error } = await resend.emails.send({
    from: resendFromEmail,
    to: input.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: "hello@selen-editions.fr",
  });
  if (error) {
    console.error("Daily : relance annuelle formateur impossible", error);
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
