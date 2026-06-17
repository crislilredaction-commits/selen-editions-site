import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail =
  process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY est manquante.");
}

if (!stripeWebhookSecret) {
  throw new Error("STRIPE_WEBHOOK_SECRET est manquante.");
}

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL est manquante.");
}

if (!supabaseServiceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY est manquante.");
}

const stripe = new Stripe(stripeSecretKey);

const resend = resendApiKey ? new Resend(resendApiKey) : null;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

type DossierConfig = {
  dossierType: string;
  title: string;
  status: string;
};

const TOOL_DOSSIER_CONFIG: Record<string, DossierConfig> = {
  preaudit_qualiopi: {
    dossierType: "preaudit",
    title: "Préaudit Qualiopi",
    status: "assignable",
  },
  preaudit: {
    dossierType: "preaudit",
    title: "Préaudit Qualiopi",
    status: "assignable",
  },
  "preaudit-qualiopi": {
    dossierType: "preaudit",
    title: "Préaudit Qualiopi",
    status: "assignable",
  },
  audit_blanc_qualiopi: {
    dossierType: "review",
    title: "Selen Review - Audit blanc Qualiopi",
    status: "in_progress",
  },

  audit_blanc: {
    dossierType: "review",
    title: "Selen Review - Audit blanc Qualiopi",
    status: "in_progress",
  },

  "audit-blanc": {
    dossierType: "review",
    title: "Selen Review - Audit blanc Qualiopi",
    status: "in_progress",
  },

  "audit-blanc-qualiopi": {
    dossierType: "review",
    title: "Selen Review - Audit blanc Qualiopi",
    status: "in_progress",
  },

  prepa_nda: {
    dossierType: "nda",
    title: "Prépa NDA - Déclaration d’activité",
    status: "draft",
  },
  "prepa-nda": {
    dossierType: "nda",
    title: "Prépa NDA - Déclaration d’activité",
    status: "draft",
  },
};

function addThreeMonths(date: Date) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 3);
  return next;
}

function formatDateFr(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatOffer(offer: string) {
  if (offer === "unique") return "Auto-audit Qualiopi — paiement unique 99 €";
  if (offer === "trois-fois")
    return "Auto-audit Qualiopi — paiement en 3 × 33 €";
  return "Auto-audit Qualiopi";
}

function getDossierConfigFromToolSlug(toolSlug: string) {
  return TOOL_DOSSIER_CONFIG[toolSlug] ?? null;
}

function getClientEmailFromSession(session: Stripe.Checkout.Session) {
  return (session.customer_details?.email || session.customer_email || "")
    .trim()
    .toLowerCase();
}

function getClientNameFromSession(session: Stripe.Checkout.Session) {
  return (
    session.customer_details?.name ||
    session.metadata?.client_name ||
    session.metadata?.name ||
    null
  );
}

async function ensureOrganisationForClient({
  email,
  fullName,
}: {
  email: string;
  fullName?: string | null;
}) {
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail) {
    throw new Error("Email client obligatoire pour créer le client Studio.");
  }

  const { data: existingOrganisation, error: existingOrganisationError } =
    await supabaseAdmin
      .from("organisations")
      .select("id, name, email")
      .eq("email", cleanEmail)
      .maybeSingle();

  if (existingOrganisationError) {
    throw new Error(
      `Impossible de vérifier le client Studio. ${existingOrganisationError.message}`,
    );
  }

  if (existingOrganisation?.id) {
    return existingOrganisation;
  }

  const fallbackName = fullName?.trim() || cleanEmail;

  const { data: newOrganisation, error: organisationError } =
    await supabaseAdmin
      .from("organisations")
      .insert({
        name: fallbackName,
        email: cleanEmail,
        status: "active",
      })
      .select("id, name, email")
      .single();

  if (organisationError || !newOrganisation) {
    throw new Error(
      `Impossible de créer le client Studio. ${
        organisationError?.message ?? ""
      }`,
    );
  }

  return newOrganisation;
}

async function ensureDossierForClientAccess({
  organisationId,
  toolSlug,
}: {
  organisationId: string;
  toolSlug: string;
}) {
  const config = getDossierConfigFromToolSlug(toolSlug);

  if (!config) {
    return null;
  }

  const { data: existingDossier, error: existingDossierError } =
    await supabaseAdmin
      .from("dossiers")
      .select("id, title, type, status")
      .eq("organisation_id", organisationId)
      .eq("type", config.dossierType)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (existingDossierError) {
    throw new Error(
      `Impossible de vérifier les dossiers existants. ${existingDossierError.message}`,
    );
  }

  if (existingDossier?.id) {
    return existingDossier;
  }

  const { data: dossier, error: dossierError } = await supabaseAdmin
    .from("dossiers")
    .insert({
      title: config.title,
      type: config.dossierType,
      organisation_id: organisationId,
      status: config.status,
    })
    .select("id, title, type, status")
    .single();

  if (dossierError || !dossier) {
    throw new Error(
      `Accès créé, mais impossible de créer le dossier Studio. ${
        dossierError?.message ?? ""
      }`,
    );
  }

  return dossier;
}

async function ensureStudioClientAndDossier({
  session,
  toolSlug,
}: {
  session: Stripe.Checkout.Session;
  toolSlug: string;
}) {
  const email = getClientEmailFromSession(session);

  if (!email) {
    throw new Error("Aucun email client trouvé dans la session Stripe.");
  }

  const organisation = await ensureOrganisationForClient({
    email,
    fullName: getClientNameFromSession(session),
  });

  const dossier = await ensureDossierForClientAccess({
    organisationId: organisation.id,
    toolSlug,
  });

  return {
    organisation,
    dossier,
  };
}

async function generateClientLoginLink(
  email: string,
  redirectPath = "/client",
) {
  const cleanRedirectPath = redirectPath.startsWith("/")
    ? redirectPath
    : `/${redirectPath}`;
  const baseActivationUrl = `${siteUrl.replace(/\/$/, "")}/client/activation`;
  const buildActivationUrl = (tokenHash: string, type: "invite" | "recovery") =>
    `${baseActivationUrl}?token_hash=${encodeURIComponent(
      tokenHash,
    )}&type=${type}&next=${encodeURIComponent(cleanRedirectPath)}`;

  const buildFallbackRedirectUrl = () =>
    `${baseActivationUrl}?next=${encodeURIComponent(cleanRedirectPath)}`;

  const getInternalLinkFromGeneratedLink = (
    generatedLink: Awaited<
      ReturnType<typeof supabaseAdmin.auth.admin.generateLink>
    >,
    type: "invite" | "recovery",
  ) => {
    const properties = generatedLink.data?.properties as
      | {
          hashed_token?: string;
          action_link?: string;
        }
      | undefined;

    if (properties?.hashed_token) {
      return buildActivationUrl(properties.hashed_token, type);
    }

    return properties?.action_link ?? null;
  };

  const inviteLink = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: buildFallbackRedirectUrl(),
    },
  });

  const inviteActivationLink = getInternalLinkFromGeneratedLink(
    inviteLink,
    "invite",
  );

  if (!inviteLink.error && inviteActivationLink) {
    return inviteActivationLink;
  }

  const recoveryLink = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: buildFallbackRedirectUrl(),
    },
  });

  if (recoveryLink.error) {
    throw new Error(
      `Erreur génération lien d’activation : ${recoveryLink.error.message}`,
    );
  }

  const recoveryActivationLink = getInternalLinkFromGeneratedLink(
    recoveryLink,
    "recovery",
  );

  if (!recoveryActivationLink) {
    throw new Error("Supabase n’a pas retourné de lien d’activation.");
  }

  return recoveryActivationLink;
}

async function sendAutoAuditAccessEmail({
  email,
  offer,
  expiresAt,
}: {
  email: string;
  offer: string;
  expiresAt: Date;
}) {
  if (!resend) {
    console.warn("RESEND_API_KEY absente : email d’accès non envoyé.");
    return;
  }

  const loginLink = await generateClientLoginLink(email, "/client/preaudit");
  const expirationLabel = formatDateFr(expiresAt);
  const offerLabel = formatOffer(offer);

  const subject = "Accès à votre espace client Selen";

  const text = [
    "Bonjour,",
    "",
    "Merci pour votre achat.",
    "",
    "Votre accès à l’auto-audit Qualiopi Selen est maintenant activé pour une durée de 3 mois.",
    "",
    `Offre : ${offerLabel}`,
    `Identifiant : ${email}`,
    `Accès valable jusqu’au : ${expirationLabel}`,
    "",
    "Pour créer votre mot de passe et accéder à votre espace client, cliquez ici :",
    loginLink,
    "",
    "Depuis votre espace, vous pourrez :",
    "- démarrer ou reprendre votre auto-audit Qualiopi ;",
    "- vérifier les indicateurs applicables à votre situation ;",
    "- prendre des notes pour préparer votre audit ;",
    "- télécharger les modèles proposés selon vos réponses ;",
    "- générer votre bilan final avec votre plan d’action.",
    "",
    "Si vous rencontrez une difficulté technique ou si vous avez une question, vous pouvez nous écrire à :",
    "hello@selen-editions.fr",
    "",
    "À très bientôt,",
    "",
    "L’équipe Selen Editions",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #3e2a1f; line-height: 1.6; max-width: 640px;">
      <h1 style="color:#8a4b24;">Accès à votre espace client Selen</h1>

      <p>Bonjour,</p>

      <p>Merci pour votre achat.</p>

      <p>
        Votre accès à l’auto-audit Qualiopi Selen est maintenant activé pour une durée de
        <strong>3 mois</strong>.
      </p>

      <div style="background:#f8efdf; border-left:4px solid #b28a62; padding:14px 16px; margin:20px 0;">
        <p style="margin:0;"><strong>Offre :</strong> ${offerLabel}</p>
        <p style="margin:6px 0 0;"><strong>Identifiant :</strong> ${email}</p>
        <p style="margin:6px 0 0;"><strong>Accès valable jusqu’au :</strong> ${expirationLabel}</p>
      </div>

      <p>
        Pour accéder à votre espace client, cliquez sur le bouton ci-dessous :
      </p>

      <p style="margin:24px 0;">
        <a href="${loginLink}" style="background:#3e2a1f; color:#f7ead6; padding:12px 18px; text-decoration:none; border-radius:999px; display:inline-block;">
          Créer mon mot de passe
        </a>
      </p>

      <p>Depuis votre espace, vous pourrez :</p>

      <ul>
        <li>démarrer ou reprendre votre auto-audit Qualiopi ;</li>
        <li>vérifier les indicateurs applicables à votre situation ;</li>
        <li>prendre des notes pour préparer votre audit ;</li>
        <li>télécharger les modèles proposés selon vos réponses ;</li>
        <li>générer votre bilan final avec votre plan d’action.</li>
      </ul>

      <p>
        Si vous rencontrez une difficulté technique ou si vous avez une question,
        vous pouvez nous écrire à
        <a href="mailto:hello@selen-editions.fr">hello@selen-editions.fr</a>.
      </p>

      <p>À très bientôt,<br />L’équipe Selen Editions</p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: resendFromEmail,
    to: email,
    subject,
    text,
    html,
    replyTo: "hello@selen-editions.fr",
  });

  if (error) {
    throw new Error(`Erreur Resend : ${error.message}`);
  }
}

async function sendPrepaNdaAccessEmail({
  email,
  dossierId,
}: {
  email: string;
  dossierId?: string | null;
}) {
  if (!resend) {
    console.warn(
      "RESEND_API_KEY absente : email d’accès Prépa NDA non envoyé.",
    );
    return;
  }

  const loginLink = await generateClientLoginLink(
    email,
    dossierId ? `/client/dossier/${dossierId}` : "/client",
  );

  const subject = "Accès à votre dossier Prépa NDA Selen";

  const text = [
    "Bonjour,",
    "",
    "Merci pour votre achat.",
    "",
    "Votre dossier Prépa NDA est maintenant ouvert dans votre espace client Selen.",
    "",
    `Identifiant : ${email}`,
    "",
    "Pour créer votre mot de passe, cliquez ici :",
    loginLink,
    "",
    "Vous pourrez ensuite vous reconnecter normalement avec votre email et ce mot de passe depuis la page de connexion client.",
    "",
    "Depuis votre espace, vous pourrez déposer les premiers éléments nécessaires à la préparation de votre dossier de déclaration d’activité.",
    "",
    "Votre agent Selen vous accompagnera ensuite dans la vérification, la préparation des documents et le suivi du dépôt.",
    "",
    "À très bientôt,",
    "",
    "L’équipe Selen Editions",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #3e2a1f; line-height: 1.6; max-width: 640px;">
      <h1 style="color:#8a4b24;">Votre dossier Prépa NDA est ouvert</h1>

      <p>Bonjour,</p>

      <p>Merci pour votre achat.</p>

      <p>
        Votre dossier <strong>Prépa NDA</strong> est maintenant ouvert dans votre espace client Selen.
      </p>

      <div style="background:#f8efdf; border-left:4px solid #b28a62; padding:14px 16px; margin:20px 0;">
        <p style="margin:0;"><strong>Identifiant :</strong> ${email}</p>
      </div>

      <p>
        Votre identifiant de connexion est votre adresse email. Pour créer votre mot de passe,
        cliquez sur le bouton ci-dessous :
      </p>

      <p style="margin:24px 0;">
        <a href="${loginLink}" style="background:#3e2a1f; color:#f7ead6; padding:12px 18px; text-decoration:none; border-radius:999px; display:inline-block;">
          Créer mon mot de passe
        </a>
      </p>

      <p>
        Vous pourrez ensuite vous reconnecter normalement avec votre email et ce mot de passe
        depuis la page de connexion client.
      </p>

      <p>
        Depuis votre espace, vous pourrez déposer les premiers éléments nécessaires à la préparation de votre dossier de déclaration d’activité.
      </p>

      <p>
        Votre agent Selen vous accompagnera ensuite dans la vérification, la préparation des documents et le suivi du dépôt.
      </p>

      <p>À très bientôt,<br />L’équipe Selen Editions</p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: resendFromEmail,
    to: email,
    subject,
    text,
    html,
    replyTo: "hello@selen-editions.fr",
  });

  if (error) {
    throw new Error(`Erreur Resend : ${error.message}`);
  }
}

async function sendAuditBlancAccessEmail({ email }: { email: string }) {
  if (!resend) {
    console.warn(
      "RESEND_API_KEY absente : email d’accès audit blanc non envoyé.",
    );
    return;
  }

  const loginLink = await generateClientLoginLink(email, "/client/audit-blanc");

  const subject = "Accès à votre audit blanc Selen Review";

  const text = [
    "Bonjour,",
    "",
    "Merci pour votre achat.",
    "",
    "Votre dossier d’audit blanc Selen Review est maintenant ouvert dans votre espace client.",
    "",
    `Identifiant : ${email}`,
    "",
    "Pour accéder à votre espace client, cliquez ici :",
    loginLink,
    "",
    "Depuis votre espace, vous pourrez suivre votre dossier, accéder aux échanges avec Selen et récupérer les éléments liés à votre audit blanc.",
    "",
    "À très bientôt,",
    "",
    "L’équipe Selen Editions",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #3e2a1f; line-height: 1.6; max-width: 640px;">
      <h1 style="color:#8a4b24;">Votre audit blanc Selen Review est ouvert</h1>

      <p>Bonjour,</p>

      <p>Merci pour votre achat.</p>

      <p>
        Votre dossier d’<strong>audit blanc Selen Review</strong> est maintenant ouvert dans votre espace client.
      </p>

      <div style="background:#f8efdf; border-left:4px solid #b28a62; padding:14px 16px; margin:20px 0;">
        <p style="margin:0;"><strong>Identifiant :</strong> ${email}</p>
      </div>

      <p>Pour accéder à votre espace client, cliquez sur le bouton ci-dessous :</p>

      <p style="margin:24px 0;">
        <a href="${loginLink}" style="background:#3e2a1f; color:#f7ead6; padding:12px 18px; text-decoration:none; border-radius:999px; display:inline-block;">
          Ouvrir mon espace client
        </a>
      </p>

      <p>
        Depuis votre espace, vous pourrez suivre votre dossier, accéder aux échanges avec Selen et récupérer les éléments liés à votre audit blanc.
      </p>

      <p>À très bientôt,<br />L’équipe Selen Editions</p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: resendFromEmail,
    to: email,
    subject,
    text,
    html,
    replyTo: "hello@selen-editions.fr",
  });

  if (error) {
    throw new Error(`Erreur Resend : ${error.message}`);
  }
}

async function activateAutoAuditAccess(session: Stripe.Checkout.Session) {
  const email = getClientEmailFromSession(session);

  if (!email) {
    throw new Error("Aucun email client trouvé dans la session Stripe.");
  }

  const now = new Date();
  const expiresAt = addThreeMonths(now);

  const offer = session.metadata?.offer ?? "unknown";
  const amountPaid = session.amount_total ?? null;
  const currency = session.currency ?? "eur";

  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  const { error } = await supabaseAdmin.from("client_tool_access").upsert(
    {
      email,
      tool_key: "preaudit_qualiopi",
      status: "active",
      access_starts_at: now.toISOString(),
      access_expires_at: expiresAt.toISOString(),
      stripe_customer_id: stripeCustomerId ?? null,
      stripe_checkout_session_id: session.id,
      stripe_subscription_id: stripeSubscriptionId ?? null,
      offer,
      amount_paid: amountPaid,
      currency,
      updated_at: now.toISOString(),
    },
    {
      onConflict: "email,tool_key",
    },
  );

  if (error) {
    throw new Error(`Erreur Supabase activation accès : ${error.message}`);
  }

  const { dossier } = await ensureStudioClientAndDossier({
    session,
    toolSlug: "prepa_nda",
  });

  if (offer === "trois-fois" && stripeSubscriptionId) {
    const cancelAt = addThreeMonths(now);

    await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at: Math.floor(cancelAt.getTime() / 1000),
      metadata: {
        product_key: "preaudit_qualiopi",
        offer,
        access_months: "3",
        max_payments: "3",
      },
    });
  }

  try {
    await sendAutoAuditAccessEmail({
      email,
      offer,
      expiresAt,
    });
  } catch (emailError) {
    console.error("Accès activé, mais email non envoyé :", emailError);
  }
}

async function createPrepaNdaCase(session: Stripe.Checkout.Session) {
  const email = getClientEmailFromSession(session);

  if (!email) {
    throw new Error("Aucun email client trouvé dans la session Stripe.");
  }

  const { dossier } = await ensureStudioClientAndDossier({
    session,
    toolSlug: "prepa_nda",
  });

  try {
    await sendPrepaNdaAccessEmail({
      email,
      dossierId: dossier?.id ?? null,
    });
  } catch (emailError) {
    console.error(
      "Dossier Prépa NDA créé, mais email non envoyé :",
      emailError,
    );
  }
}

async function createAuditBlancCase(session: Stripe.Checkout.Session) {
  const email = getClientEmailFromSession(session);

  if (!email) {
    throw new Error("Aucun email client trouvé dans la session Stripe.");
  }

  const existingCase = await supabaseAdmin
    .from("audit_blanc_cases")
    .select("id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  if (existingCase.error) {
    throw new Error(
      `Impossible de vérifier l’existence de l’audit blanc. ${existingCase.error.message}`,
    );
  }

  const { dossier } = await ensureStudioClientAndDossier({
    session,
    toolSlug: "audit_blanc_qualiopi",
  });

  if (existingCase.data?.id) {
    if (dossier?.id) {
      await supabaseAdmin
        .from("audit_blanc_cases")
        .update({
          dossier_id: dossier.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingCase.data.id)
        .is("dossier_id", null);
    }

    return existingCase.data;
  }

  const now = new Date();

  const offer = session.metadata?.offer ?? "direct";
  const amountPaid = session.amount_total ?? null;
  const currency = session.currency ?? "eur";

  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  const stripePaymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  const { data, error } = await supabaseAdmin
    .from("audit_blanc_cases")
    .insert({
      client_email: email,
      dossier_id: dossier?.id ?? null,
      status: "booking_pending",
      offer,
      price_paid: amountPaid,
      currency,
      stripe_checkout_session_id: session.id,
      stripe_customer_id: stripeCustomerId ?? null,
      stripe_payment_intent_id: stripePaymentIntentId ?? null,
      report_status: "not_started",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .select("id, dossier_id")
    .single();

  if (error) {
    throw new Error(
      `Erreur Supabase création dossier audit blanc : ${error.message}`,
    );
  }
  try {
    await sendAuditBlancAccessEmail({ email });
  } catch (emailError) {
    console.error("Audit blanc créé, mais email non envoyé :", emailError);
  }

  return data;
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Signature Stripe manquante." },
      { status: 400 },
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      stripeWebhookSecret!,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Signature webhook invalide : ${error.message}`
            : "Signature webhook invalide.",
      },
      { status: 400 },
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.metadata?.product_key === "preaudit_qualiopi") {
        await activateAutoAuditAccess(session);
      }

      if (session.metadata?.product_key === "audit_blanc_qualiopi") {
        await createAuditBlancCase(session);
      }
      if (session.metadata?.product_key === "prepa_nda") {
        await createPrepaNdaCase(session);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Erreur webhook Stripe :", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue dans le webhook Stripe.",
      },
      { status: 500 },
    );
  }
}
