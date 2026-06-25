import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  markDiscountCodeUsed,
  validateDiscountCode,
} from "@/lib/server/discountCodes";
import { fulfillFreeAuditBlanc } from "@/lib/server/paymentFulfillment";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

if (!stripeSecretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY est manquante dans les variables d’environnement.",
  );
}

const stripe = new Stripe(stripeSecretKey);

type AuditBlancOffer = "direct" | "reserved_after_auto_audit";

const OFFERS: Record<
  AuditBlancOffer,
  {
    label: string;
    amount: number;
    description: string;
  }
> = {
  direct: {
    label: "Audit blanc Qualiopi direct",
    amount: 39700,
    description:
      "Audit blanc Qualiopi accompagné par un auditeur — paiement direct sans auto-audit préalable.",
  },
  reserved_after_auto_audit: {
    label: "Audit blanc Qualiopi après auto-audit",
    amount: 19900,
    description:
      "Audit blanc Qualiopi au tarif réservé pour les clients ayant réalisé l’auto-audit.",
  },
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    // Pour l’instant, seul l’audit blanc direct est ouvert publiquement.
    // Le tarif réservé après auto-audit sera branché plus tard depuis l’espace client,
    // avec vérification de l’accès auto-audit.
    const offerKey: AuditBlancOffer = "direct";

    const offer = OFFERS[offerKey];
    const body = await request.json().catch(() => null);
    const clientEmail = clean(body?.clientEmail).toLowerCase();
    const discountCode = clean(body?.discountCode);
    const discount = discountCode
      ? await validateDiscountCode({
          code: discountCode,
          clientEmail,
          amountCents: offer.amount,
        })
      : null;

    if (discount && !discount.valid) {
      return NextResponse.json({ error: discount.reason }, { status: 400 });
    }

    const discountAmountCents = discount?.valid
      ? discount.discountAmountCents
      : 0;
    const finalAmountCents = discount?.valid
      ? discount.finalAmountCents
      : offer.amount;

    if (finalAmountCents === 0) {
      await fulfillFreeAuditBlanc({ email: clientEmail, offer: offerKey });
      await markDiscountCodeUsed({
        discountCodeId: discount!.discountCodeId,
        clientEmail,
      });

      return NextResponse.json({
        ok: true,
        freeRedirectUrl: `${siteUrl}/paiement/audit-blanc/succes?discount=1`,
      });
    }

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
            unit_amount: finalAmountCents,
            product_data: {
              name: offer.label,
              description: offer.description,
            },
          },
        },
      ],

      metadata: {
        product_key: "audit_blanc_qualiopi",
        offer: offerKey,
        discount_code: discount?.valid ? discount.code : "",
        discount_code_id: discount?.valid ? discount.discountCodeId : "",
        original_amount_cents: String(offer.amount),
        discount_amount_cents: String(discountAmountCents),
        final_amount_cents: String(finalAmountCents),
        client_email: clientEmail,
      },

      success_url: `${siteUrl}/paiement/audit-blanc/succes?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/selen-review`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Erreur création checkout audit blanc :", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de créer la session de paiement audit blanc.",
      },
      { status: 500 },
    );
  }
}
