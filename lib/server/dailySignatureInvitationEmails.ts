import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

type SignatureInvitationInput = {
  email: string;
  signatoryName: string;
  documentName: string;
  formationTitle: string;
  signatureUrl: string;
  expiresAt?: string | null;
};

export function prepareDailySignatureInvitationEmail(input: SignatureInvitationInput) {
  const subject = `Signature attendue · ${input.documentName}`;
  const expiry = input.expiresAt ? ` Le lien est valable jusqu’au ${formatDateTime(input.expiresAt)}.` : "";
  const text = [
    `Bonjour ${input.signatoryName || ""},`.trim(),
    "",
    `Votre signature est attendue pour le document « ${input.documentName} » concernant la formation « ${input.formationTitle} ».${expiry}`,
    "",
    `Accéder au document et signer : ${input.signatureUrl}`,
    "",
    "Une simple consultation du lien ne vaut pas signature.",
    "",
    "Selen Editions",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
    <p>Bonjour ${escapeHtml(input.signatoryName)},</p>
    <p>Votre signature est attendue pour le document <strong>${escapeHtml(input.documentName)}</strong> concernant la formation <strong>${escapeHtml(input.formationTitle)}</strong>.${escapeHtml(expiry)}</p>
    <p><a href="${escapeHtml(input.signatureUrl)}" style="display:inline-block;padding:12px 18px;background:#4f392d;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">Consulter et signer</a></p>
    <p style="font-size:13px;color:#70503b">Une simple consultation du lien ne vaut pas signature.</p>
    <p>Selen Editions</p>
  </div>`;
  return { subject, text, html };
}

export async function sendDailySignatureInvitation(input: SignatureInvitationInput) {
  if (!resend) return { sent: false as const, reason: "missing_resend_api_key" as const };
  const message = prepareDailySignatureInvitationEmail(input);
  const { data, error } = await resend.emails.send({
    from: resendFromEmail,
    to: input.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: "hello@selen-editions.fr",
  });
  if (error) {
    console.error("Daily : invitation de signature impossible", error);
    return { sent: false as const, reason: "send_failed" as const };
  }
  return { sent: true as const, message: { ...message, providerMessageId: data?.id ?? null } };
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
