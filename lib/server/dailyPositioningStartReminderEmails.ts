import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

type Input = {
  email: string;
  trainerName: string;
  formationTitle: string;
  missingLearnerNames: string[];
  workspaceUrl?: string | null;
};

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function prepareDailyPositioningStartReminder(input: Input) {
  const count = input.missingLearnerNames.length;
  const learnerLines = input.missingLearnerNames.map((name) => `- ${name}`).join("\n");
  const learnerHtml = input.missingLearnerNames.map((name) => `<li>${escapeHtml(name)}</li>`).join("");
  const subject = `Positionnement à terminer · ${input.formationTitle}`;
  const text = [
    `Bonjour ${input.trainerName || ""},`.trim(),
    "",
    `${count} apprenant${count > 1 ? "s n’ont" : " n’a"} pas encore terminé le positionnement pour la formation « ${input.formationTitle} » :`,
    learnerLines,
    "",
    "Ils peuvent encore le compléter depuis leur espace apprenant au début de la formation.",
    "Merci de vérifier avec eux avant de poursuivre la session.",
    input.workspaceUrl ? "" : null,
    input.workspaceUrl ? "Suivi des participants :" : null,
    input.workspaceUrl || null,
    "",
    "Selen Editions",
  ].filter((line): line is string => line !== null).join("\n");
  const action = input.workspaceUrl
    ? `<p><a href="${escapeHtml(input.workspaceUrl)}" style="display:inline-block;padding:12px 18px;background:#8a4b24;color:#fffaf0;text-decoration:none;font-weight:700">Ouvrir le suivi des participants</a></p>`
    : "";
  const html = `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
    <p>Bonjour ${escapeHtml(input.trainerName)},</p>
    <p><strong>${count} apprenant${count > 1 ? "s n’ont" : " n’a"} pas encore terminé le positionnement</strong> pour la formation « ${escapeHtml(input.formationTitle)} » :</p>
    <ul>${learnerHtml}</ul>
    <p>Ils peuvent encore le compléter depuis leur espace apprenant au début de la formation. Merci de vérifier avec eux avant de poursuivre la session.</p>
    ${action}
    <p>Selen Editions</p>
  </div>`;
  return { subject, text, html };
}

export async function sendDailyPositioningStartReminder(input: Input) {
  if (!resend) return { sent: false as const, reason: "missing_resend_api_key" as const };
  const message = prepareDailyPositioningStartReminder(input);
  const { data, error } = await resend.emails.send({
    from: resendFromEmail,
    to: input.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: "hello@selen-editions.fr",
  });
  if (error) {
    console.error("Daily : rappel positionnement formateur impossible", error);
    return { sent: false as const, reason: "send_failed" as const };
  }
  return { sent: true as const, message: { ...message, providerMessageId: data?.id ?? null } };
}
