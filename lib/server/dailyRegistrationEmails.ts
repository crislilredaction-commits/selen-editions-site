import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

type ConfirmationInput = {
  email: string;
  firstName?: string | null;
  organisationName?: string | null;
  formationTitle?: string | null;
  nextStep: "scheduled" | "date_to_plan" | "asynchronous";
  sessionLabel?: string | null;
};

export async function sendDailyRegistrationConfirmation({
  email,
  firstName,
  organisationName,
  formationTitle,
  nextStep,
  sessionLabel,
}: ConfirmationInput) {
  if (!email) return { sent: false, reason: "missing_email" as const };
  if (!resend) {
    console.warn("RESEND_API_KEY absente : email de confirmation Daily non envoyé.");
    return { sent: false, reason: "missing_resend_api_key" as const };
  }

  const organisation = organisationName || "votre organisme de formation";
  const greeting = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  const nextStepText = nextStep === "asynchronous"
    ? "La formation se déroule à distance en asynchrone. Vos identifiants d’accès vous seront envoyés par email lorsque votre inscription aura été traitée."
    : nextStep === "scheduled"
      ? `Vous avez choisi une session planifiée${sessionLabel ? ` : ${sessionLabel}` : ""}. L’organisme vous transmettra les informations utiles pour la suite.`
      : "Aucune session n’est actuellement planifiée. Une date va être calée avec le formateur et l’organisme reviendra vers vous dès que possible.";

  const text = [
    greeting,
    "",
    `Merci, nous avons bien reçu votre dossier d’inscription${formationTitle ? ` pour la formation « ${formationTitle} »` : ""}.`,
    `${organisation} va maintenant examiner votre demande avec l’appui de Selen Editions.`,
    nextStepText,
    "",
    "Nous traitons votre demande dans les meilleurs délais.",
    "",
    `Selen Editions, partenaire de ${organisation}`,
  ].join("\n");

  const { error } = await resend.emails.send({
    from: resendFromEmail,
    to: email,
    subject: `Confirmation de réception de votre dossier${formationTitle ? ` – ${formationTitle}` : ""}`,
    text,
    html: `<div style="font-family:Arial,sans-serif;color:#3e2a1f;line-height:1.6;max-width:640px">${text.split("\n").map((line) => line ? `<p>${line}</p>` : "<br />").join("")}</div>`,
    replyTo: "hello@selen-editions.fr",
  });

  if (error) throw new Error(`Erreur Resend : ${error.message}`);
  return { sent: true as const };
}
