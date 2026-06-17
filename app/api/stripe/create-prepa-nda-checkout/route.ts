import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

if (!stripeSecretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY est manquante dans les variables d’environnement.",
  );
}

const stripe = new Stripe(stripeSecretKey);

export async function POST() {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_creation: "always",
      billing_address_collection: "auto",
      allow_promotion_codes: false,

      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: 39000,
            product_data: {
              name: "Prépa NDA - Déclaration d’activité",
              description:
                "Accompagnement à la préparation du dossier de déclaration d’activité d’un organisme de formation.",
            },
          },
        },
      ],

      metadata: {
        product_key: "prepa_nda",
        offer: "standard",
      },

      success_url: `${siteUrl}/paiement/prepa-nda/succes?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/prepa-nda`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe n’a pas retourné d’URL de paiement." },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Erreur création checkout Prépa NDA :", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de créer la session de paiement Prépa NDA.",
      },
      { status: 500 },
    );
  }
}
