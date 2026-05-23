import { NextResponse } from "next/server";
import Stripe from "stripe";

type AutoAuditOffer = "unique" | "trois-fois";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

if (!stripeSecretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY est manquante dans les variables d’environnement.",
  );
}

const stripe = new Stripe(stripeSecretKey);

function isValidOffer(value: unknown): value is AutoAuditOffer {
  return value === "unique" || value === "trois-fois";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const offer = body?.offer;

    if (!isValidOffer(offer)) {
      return NextResponse.json(
        { error: "Offre auto-audit invalide." },
        { status: 400 },
      );
    }

    const isThreePayments = offer === "trois-fois";

    const session = await stripe.checkout.sessions.create({
      mode: isThreePayments ? "subscription" : "payment",

      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            product_data: {
              name: isThreePayments
                ? "Auto-audit Qualiopi — 3 × 33 €"
                : "Auto-audit Qualiopi — 3 mois d’accès",
              description: isThreePayments
                ? "Accès 3 mois à l’auto-audit Qualiopi, paiement fractionné en 3 échéances mensuelles."
                : "Accès 3 mois à l’auto-audit Qualiopi.",
            },
            unit_amount: isThreePayments ? 3300 : 9900,
            ...(isThreePayments
              ? {
                  recurring: {
                    interval: "month" as const,
                    interval_count: 1,
                  },
                }
              : {}),
          },
        },
      ],

      success_url: `${siteUrl}/paiement/auto-audit/succes?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/paiement/auto-audit?offre=${offer}`,

      customer_creation: isThreePayments ? undefined : "always",

      metadata: {
        product_key: "preaudit_qualiopi",
        offer,
        access_months: "3",
        audit_blanc_reserved_price: "199",
      },

      ...(isThreePayments
        ? {
            subscription_data: {
              metadata: {
                product_key: "preaudit_qualiopi",
                offer,
                access_months: "3",
                max_payments: "3",
                should_cancel_after_months: "3",
              },
            },
          }
        : {
            payment_intent_data: {
              metadata: {
                product_key: "preaudit_qualiopi",
                offer,
                access_months: "3",
              },
            },
          }),
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe n’a pas retourné d’URL de paiement." },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Erreur création Checkout auto-audit :", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant la création du paiement.",
      },
      { status: 500 },
    );
  }
}
