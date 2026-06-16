import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail =
  process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

const resend = resendApiKey ? new Resend(resendApiKey) : null;

type NotifyClientVisibleDocumentsInput = {
  supabase: SupabaseClient;
  dossierId: string;
  subject?: string;
  text?: string;
};

export async function notifyClientVisibleDocuments({
  supabase,
  dossierId,
  subject = "Vos documents NDA sont disponibles",
  text,
}: NotifyClientVisibleDocumentsInput) {
  if (!resend) {
    console.warn("RESEND_API_KEY absente : email client non envoyé.");
    return;
  }

  const { data: dossier, error } = await supabase
    .from("dossiers")
    .select(
      `
      id,
      organisations:organisation_id (
        email,
        name
      )
    `,
    )
    .eq("id", dossierId)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossible de récupérer le client : ${error.message}`);
  }

  const organisationRaw = Array.isArray(dossier?.organisations)
    ? dossier?.organisations?.[0]
    : dossier?.organisations;
  const email = organisationRaw?.email?.trim();

  if (!email) {
    console.warn("Email client absent : notification documents non envoyée.");
    return;
  }

  const dossierUrl = siteUrl ? `${siteUrl}/client/dossier/${dossierId}` : null;
  const body =
    text ??
    "Bonjour, vos documents à signer sont maintenant disponibles dans votre espace client Selen. Vous pouvez les télécharger, les signer, puis déposer les documents signés et les pièces finales directement dans votre dossier.";

  const emailText = [
    body,
    "",
    dossierUrl ? `Accéder au dossier : ${dossierUrl}` : null,
    "",
    "L'équipe Selen Editions",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #3e2a1f; line-height: 1.6; max-width: 640px;">
      <p>Bonjour,</p>
      <p>
        Vos documents à signer sont maintenant disponibles dans votre espace client Selen.
        Vous pouvez les télécharger, les signer, puis déposer les documents signés et les pièces finales directement dans votre dossier.
      </p>
      ${
        dossierUrl
          ? `<p style="margin:24px 0;"><a href="${dossierUrl}" style="background:#3e2a1f; color:#f7ead6; padding:12px 18px; text-decoration:none; border-radius:999px; display:inline-block;">Ouvrir mon dossier</a></p>`
          : ""
      }
      <p>L'équipe Selen Editions</p>
    </div>
  `;

  const { error: sendError } = await resend.emails.send({
    from: resendFromEmail,
    to: email,
    subject,
    text: emailText,
    html,
    replyTo: "hello@selen-editions.fr",
  });

  if (sendError) {
    throw new Error(`Erreur Resend : ${sendError.message}`);
  }
}
