import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

type SentEmailSnapshot = {
  subject: string;
  text: string;
  html: string;
  providerMessageId: string | null;
};

export async function sendDailyAttendanceVerificationCode(input: {
  email: string;
  learnerName: string;
  formationTitle: string;
  code: string;
}) {
  if (!resend) {
    console.warn("RESEND_API_KEY absente : code d’émargement Daily non envoyé.");
    return { sent: false as const, reason: "missing_resend_api_key" as const };
  }

  const subject = `Votre code d’émargement Selen Daily : ${input.code}`;
  const text = [
    `Bonjour ${input.learnerName || ""},`.trim(),
    "",
    `Votre code pour confirmer votre présence à la formation « ${input.formationTitle} » est : ${input.code}`,
    "",
    "Ce code est valable 10 minutes. Ne le transmettez à personne.",
    "",
    "Selen Editions",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
      <p>Bonjour ${escapeHtml(input.learnerName)},</p>
      <p>Votre code pour confirmer votre présence à la formation <strong>${escapeHtml(input.formationTitle)}</strong> est :</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:6px">${escapeHtml(input.code)}</p>
      <p>Ce code est valable 10 minutes. Ne le transmettez à personne.</p>
      <p>Selen Editions</p>
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
    console.error("Émargement Daily : envoi du code impossible", error);
    return { sent: false as const, reason: "send_failed" as const };
  }
  return { sent: true as const, message: { subject, text, html, providerMessageId: data?.id ?? null } satisfies SentEmailSnapshot };
}

export async function sendDailyAttendanceReminder(input: {
  email: string;
  learnerName: string;
  formationTitle: string;
  slotLabel: string;
  attendanceUrl: string;
}) {
  if (!resend) {
    console.warn("RESEND_API_KEY absente : relance d’émargement Daily non envoyée.");
    return { sent: false as const, reason: "missing_resend_api_key" as const };
  }

  const subject = `Rappel d’émargement · ${input.formationTitle}`;
  const text = [
    `Bonjour ${input.learnerName || ""},`.trim(),
    "",
    `Votre présence reste à confirmer pour la formation « ${input.formationTitle} » (${input.slotLabel}).`,
    "",
    "Vous pouvez émarger depuis votre téléphone avec ce lien :",
    input.attendanceUrl,
    "",
    "Le lien est personnel. Ne le transmettez pas.",
    "",
    "Selen Editions",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
      <p>Bonjour ${escapeHtml(input.learnerName)},</p>
      <p>Votre présence reste à confirmer pour la formation <strong>${escapeHtml(input.formationTitle)}</strong>.</p>
      <p>${escapeHtml(input.slotLabel)}</p>
      <p>Pour signer facilement, utilisez de préférence votre téléphone.</p>
      <p><a href="${escapeHtml(input.attendanceUrl)}" style="display:inline-block;padding:12px 18px;background:#8a4b24;color:#fffaf0;text-decoration:none;font-weight:700">Confirmer ma présence</a></p>
      <p style="font-size:13px">Ce lien est personnel. Ne le transmettez pas.</p>
      <p>Selen Editions</p>
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
    console.error("Émargement Daily : relance impossible", error);
    return { sent: false as const, reason: "send_failed" as const };
  }
  return { sent: true as const, message: { subject, text, html, providerMessageId: data?.id ?? null } satisfies SentEmailSnapshot };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
