import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

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

  const { error } = await resend.emails.send({
    from: resendFromEmail,
    to: input.email,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
      <p>Bonjour ${escapeHtml(input.learnerName)},</p>
      <p>Votre code pour confirmer votre présence à la formation <strong>${escapeHtml(input.formationTitle)}</strong> est :</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:6px">${escapeHtml(input.code)}</p>
      <p>Ce code est valable 10 minutes. Ne le transmettez à personne.</p>
      <p>Selen Editions</p>
    </div>`,
    replyTo: "hello@selen-editions.fr",
  });

  if (error) {
    console.error("Émargement Daily : envoi du code impossible", error);
    return { sent: false as const, reason: "send_failed" as const };
  }
  return { sent: true as const };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
