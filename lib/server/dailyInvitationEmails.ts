import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export async function sendDailyOrganisationInvitation(input: {
  email: string;
  organisationName: string;
  invitationUrl: string;
  roles: string[];
}) {
  if (!resend) {
    console.warn("RESEND_API_KEY absente : invitation Daily non envoyée.");
    return { sent: false as const, reason: "missing_resend_api_key" as const };
  }

  const roleLabels = input.roles.map((role) => {
    if (role === "trainer") return "formateur";
    if (role === "admin_assistant") return "assistant administratif";
    return role;
  });
  const roleText = roleLabels.join(", ") || "utilisateur";
  const subject = `Invitation à rejoindre ${input.organisationName} sur Selen Daily`;
  const text = [
    "Bonjour,",
    "",
    `Vous êtes invité(e) à rejoindre ${input.organisationName} sur Selen Daily en tant que ${roleText}.`,
    "Connectez-vous avec cette adresse email puis acceptez l’invitation depuis le lien ci-dessous.",
    "",
    input.invitationUrl,
    "",
    "Ce lien est valable 7 jours et ne peut être utilisé qu’une seule fois.",
    "",
    "À bientôt,",
    "Selen Editions",
  ].join("\n");

  const { error } = await resend.emails.send({
    from: resendFromEmail,
    to: input.email,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">
      <p>Bonjour,</p>
      <p>Vous êtes invité(e) à rejoindre <strong>${escapeHtml(input.organisationName)}</strong> sur Selen Daily en tant que ${escapeHtml(roleText)}.</p>
      <p>Connectez-vous avec cette adresse email puis acceptez l’invitation :</p>
      <p><a href="${escapeHtml(input.invitationUrl)}" style="display:inline-block;padding:12px 18px;background:#3e2a1f;color:#fff;text-decoration:none">Accepter l’invitation</a></p>
      <p>Ce lien est valable 7 jours et ne peut être utilisé qu’une seule fois.</p>
      <p>À bientôt,<br/>Selen Editions</p>
    </div>`,
    replyTo: "hello@selen-editions.fr",
  });

  if (error) {
    console.error("Invitation Daily : envoi email impossible", error);
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
