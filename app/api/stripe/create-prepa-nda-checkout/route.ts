import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  markDiscountCodeUsed,
  validateDiscountCode,
} from "@/lib/server/discountCodes";
import { fulfillFreePrepaNda } from "@/lib/server/paymentFulfillment";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

if (!stripeSecretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY est manquante dans les variables d’environnement.",
  );
}

const stripe = new Stripe(stripeSecretKey);

const ORIGINAL_AMOUNT_CENTS = 39000;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const clientEmail = clean(body?.clientEmail).toLowerCase();
    const discountCode = clean(body?.discountCode);
    const discount = discountCode
      ? await validateDiscountCode({
          code: discountCode,
          clientEmail,
          amountCents: ORIGINAL_AMOUNT_CENTS,
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
      : ORIGINAL_AMOUNT_CENTS;

    if (finalAmountCents === 0) {
      await fulfillFreePrepaNda({ email: clientEmail });
      await markDiscountCodeUsed({
        discountCodeId: discount!.discountCodeId,
        clientEmail,
      });

      return NextResponse.json({
        ok: true,
        freeRedirectUrl: `${siteUrl}/paiement/prepa-nda/succes?discount=1`,
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
        discount_code: discount?.valid ? discount.code : "",
        discount_code_id: discount?.valid ? discount.discountCodeId : "",
        original_amount_cents: String(ORIGINAL_AMOUNT_CENTS),
        discount_amount_cents: String(discountAmountCents),
        final_amount_cents: String(finalAmountCents),
        client_email: clientEmail,
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
