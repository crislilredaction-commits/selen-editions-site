import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export type DailySatisfactionEmailSnapshot = {
  subject: string;
  text: string;
  html: string;
  providerMessageId: string | null;
};

export async function sendDailySatisfactionRequest(input: {
  email: string;
  learnerName: string;
  formationTitle: string;
  feedbackUrl: string;
  expiresAt: string;
}) {
  if (!resend) {
    console.warn("RESEND_API_KEY absente : demande de satisfaction Daily non envoyée.");
    return { sent: false as const, reason: "missing_resend_api_key" as const };
  }

  const subject = `Votre avis sur la formation · ${input.formationTitle}`;
  const expiresText = formatDate(input.expiresAt);
  const text = [
    `Bonjour ${input.learnerName || ""},`.trim(),
    "",
    `La formation « ${input.formationTitle} » est terminée. Votre retour nous aide à améliorer les prochaines sessions.`,
    "",
    "Vous pouvez répondre au questionnaire de satisfaction avec ce lien personnel :",
    input.feedbackUrl,
    "",
    `Le lien reste disponible jusqu’au ${expiresText}.`,
    "",
    "Merci pour votre retour,",
    "Selen Editions",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
      <p>Bonjour ${escapeHtml(input.learnerName)},</p>
      <p>La formation <strong>${escapeHtml(input.formationTitle)}</strong> est terminée. Votre retour nous aide à améliorer les prochaines sessions.</p>
      <p><a href="${escapeHtml(input.feedbackUrl)}" style="display:inline-block;padding:12px 18px;background:#8a4b24;color:#fffaf0;text-decoration:none;font-weight:700">Donner mon avis</a></p>
      <p style="font-size:13px">Ce lien personnel reste disponible jusqu’au ${escapeHtml(expiresText)}.</p>
      <p>Merci pour votre retour,<br/>Selen Editions</p>
    </div>`;

  const { data, error } = await resend.emails.send({
    from: resendFromEmail,
    to: input.email,
    subject,
    text,
    html,
    replyTo: "hello@selen-editions.fr",
  });

  if (error) {
    console.error("Daily : demande de satisfaction impossible", error);
    return { sent: false as const, reason: "send_failed" as const };
  }

  return {
    sent: true as const,
    message: {
      subject,
      text,
      html,
      providerMessageId: data?.id ?? null,
    } satisfies DailySatisfactionEmailSnapshot,
  };
}

function formatDate(value: string) {
  const date = new Date(value);
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
