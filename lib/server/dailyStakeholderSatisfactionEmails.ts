import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export type DailyStakeholderSatisfactionEmailInput = {
  email: string;
  recipientName: string;
  formationTitle: string;
  sessionReference: string;
  satisfactionUrl: string;
  reminder: boolean;
  stakeholderType: "company" | "trainer";
};

export function prepareDailyStakeholderSatisfactionEmail(input: DailyStakeholderSatisfactionEmailInput) {
  const subject = input.reminder
    ? `Rappel · votre retour sur la formation · ${input.formationTitle}`
    : `Votre retour sur la formation · ${input.formationTitle}`;
  const firstRequestIntro = input.stakeholderType === "trainer"
    ? "La session arrive à son terme et nous souhaitons recueillir votre retour en tant que formateur."
    : "La formation est terminée depuis quelques jours et nous souhaitons recueillir votre retour en tant que commanditaire.";
  const intro = input.reminder
    ? "Nous n’avons pas encore reçu votre retour sur la formation."
    : firstRequestIntro;
  const text = [
    `Bonjour ${input.recipientName || ""},`.trim(),
    "",
    intro,
    "",
    `Session : ${input.sessionReference || input.formationTitle}`,
    "Votre questionnaire est disponible dans votre espace Selen Daily :",
    input.satisfactionUrl,
    "",
    "Vos réponses permettent d’alimenter l’analyse qualité et les actions d’amélioration de l’organisme de formation.",
    "",
    "Selen Editions",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
    <p>Bonjour ${escapeHtml(input.recipientName)},</p>
    <p>${escapeHtml(intro)}</p>
    <p><strong>Session :</strong> ${escapeHtml(input.sessionReference || input.formationTitle)}</p>
    <p><a href="${escapeHtml(input.satisfactionUrl)}" style="display:inline-block;padding:12px 18px;background:#8a4b24;color:#fffaf0;text-decoration:none;font-weight:700">Répondre au questionnaire</a></p>
    <p>Vos réponses permettent d’alimenter l’analyse qualité et les actions d’amélioration de l’organisme de formation.</p>
    <p>Selen Editions</p>
  </div>`;
  return { subject, text, html };
}

export async function sendDailyStakeholderSatisfactionEmail(input: DailyStakeholderSatisfactionEmailInput) {
  if (!resend) {
    console.warn("RESEND_API_KEY absente : satisfaction partie prenante Daily non envoyée.");
    return { sent: false as const, reason: "missing_resend_api_key" as const };
  }
  const message = prepareDailyStakeholderSatisfactionEmail(input);
  const { data, error } = await resend.emails.send({
    from: resendFromEmail,
    to: input.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: "hello@selen-editions.fr",
  });
  if (error) {
    console.error("Daily : satisfaction partie prenante impossible", error);
    return { sent: false as const, reason: "send_failed" as const };
  }
  return { sent: true as const, message: { ...message, providerMessageId: data?.id ?? null } };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
