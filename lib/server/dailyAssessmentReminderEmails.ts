import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export type DailyAssessmentReminderEmailInput = {
  email: string;
  trainerName: string;
  formationTitle: string;
  sessionReference: string;
  missingCount: number;
  uploadUrl: string;
};

export function prepareDailyAssessmentReminderEmail(input: DailyAssessmentReminderEmailInput) {
  const subject = `Action requise · évaluations des acquis · ${input.formationTitle}`;
  const learnerLabel = input.missingCount > 1 ? `${input.missingCount} apprenants` : "1 apprenant";
  const text = [
    `Bonjour ${input.trainerName || ""},`.trim(),
    "",
    `La session ${input.sessionReference || input.formationTitle} arrive à son dernier jour et aucune évaluation Selen n’est configurée pour cette formation.`,
    "",
    `Il manque actuellement une preuve d’évaluation des acquis pour ${learnerLabel}.`,
    "Merci de photographier ou numériser les évaluations réalisées puis de les téléverser dans Selen Daily :",
    input.uploadUrl,
    "",
    "Cette preuve sera ensuite contrôlée par Selen.",
    "",
    "Selen Editions",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
      <p>Bonjour ${escapeHtml(input.trainerName)},</p>
      <p>La session <strong>${escapeHtml(input.sessionReference || input.formationTitle)}</strong> arrive à son dernier jour et aucune évaluation Selen n’est configurée pour cette formation.</p>
      <p>Il manque actuellement une preuve d’évaluation des acquis pour <strong>${escapeHtml(learnerLabel)}</strong>.</p>
      <p>Merci de photographier ou numériser les évaluations réalisées puis de les téléverser dans Selen Daily.</p>
      <p><a href="${escapeHtml(input.uploadUrl)}" style="display:inline-block;padding:12px 18px;background:#8a4b24;color:#fffaf0;text-decoration:none;font-weight:700">Téléverser les évaluations</a></p>
      <p>La preuve sera ensuite contrôlée par Selen.</p>
      <p>Selen Editions</p>
    </div>`;
  return { subject, text, html };
}

export async function sendDailyAssessmentReminder(input: DailyAssessmentReminderEmailInput) {
  if (!resend) {
    console.warn("RESEND_API_KEY absente : rappel d’évaluation Daily non envoyé.");
    return { sent: false as const, reason: "missing_resend_api_key" as const };
  }

  const message = prepareDailyAssessmentReminderEmail(input);
  const { data, error } = await resend.emails.send({
    from: resendFromEmail,
    to: input.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: "hello@selen-editions.fr",
  });

  if (error) {
    console.error("Daily : rappel d’évaluation impossible", error);
    return { sent: false as const, reason: "send_failed" as const };
  }

  return {
    sent: true as const,
    message: {
      ...message,
      providerMessageId: data?.id ?? null,
    },
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
