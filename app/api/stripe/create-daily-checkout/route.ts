import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const dailyPriceId = process.env.STRIPE_DAILY_PRICE_ID_BASE?.trim();

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY est manquante dans les variables d'environnement.");
}

const stripe = new Stripe(stripeSecretKey);
const DAILY_BASE_AMOUNT_CENTS = 8900;
const DAILY_UPPER_AMOUNT_CENTS = 14900;
const DAILY_ANNUAL_LIMIT = 150;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const clientEmail = clean(body?.clientEmail).toLowerCase();
    const acceptedPricingRule = body?.acceptedPricingRule === true;

    if (!clientEmail) {
      return NextResponse.json({ error: "Email client requis." }, { status: 400 });
    }
    if (!acceptedPricingRule) {
      return NextResponse.json(
        { error: "Vous devez accepter la règle de palier Selen Daily." },
        { status: 400 },
      );
    }

    const lineItem = dailyPriceId
      ? { quantity: 1, price: dailyPriceId }
      : {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: DAILY_BASE_AMOUNT_CENTS,
            recurring: { interval: "month" as const },
            product_data: {
              name: "Selen Daily",
              description:
                "Abonnement mensuel Selen Daily jusqu'à 150 apprenants par an.",
            },
          },
        };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: clientEmail,
      billing_address_collection: "auto",
      line_items: [lineItem],
      metadata: {
        product_key: "selen_daily",
        offer: "monthly_base",
        client_email: clientEmail,
        annual_learner_limit: String(DAILY_ANNUAL_LIMIT),
        base_monthly_amount_cents: String(DAILY_BASE_AMOUNT_CENTS),
        upper_monthly_amount_cents: String(DAILY_UPPER_AMOUNT_CENTS),
        pricing_rule_accepted: "true",
        pricing_rule_version: "daily_150_2026_07",
        // TODO paiement: quand le Price ID Stripe du palier 149 EUR sera disponible,
        // mettre a jour l'abonnement via stripe.subscriptions.update(...).
        upper_tier_price_id: process.env.STRIPE_DAILY_PRICE_ID_UPPER?.trim() ?? "",
      },
      subscription_data: {
        metadata: {
          product_key: "selen_daily",
          annual_learner_limit: String(DAILY_ANNUAL_LIMIT),
          upper_monthly_amount_cents: String(DAILY_UPPER_AMOUNT_CENTS),
        },
      },
      success_url: `${siteUrl}/paiement/selen-daily/succes?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/nos-prestations`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe n'a pas retourné d'URL de paiement." },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Erreur création checkout Selen Daily :", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de créer la session de paiement Selen Daily.",
      },
      { status: 500 },
    );
  }
}
