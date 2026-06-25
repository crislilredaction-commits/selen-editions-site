import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  markDiscountCodeUsed,
  validateDiscountCode,
} from "@/lib/server/discountCodes";
import { fulfillFreeAutoAudit } from "@/lib/server/paymentFulfillment";

type AutoAuditOffer = "unique" | "trois-fois";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

if (!stripeSecretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY est manquante dans les variables d’environnement.",
  );
}

const stripe = new Stripe(stripeSecretKey);
const AUTO_AUDIT_AMOUNT_CENTS = 9900;

function isValidOffer(value: unknown): value is AutoAuditOffer {
  return value === "unique" || value === "trois-fois";
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
    const clientEmail = clean(body?.clientEmail).toLowerCase();
    const discountCode = clean(body?.discountCode);
    const discount = discountCode
      ? await validateDiscountCode({
          code: discountCode,
          clientEmail,
          amountCents: AUTO_AUDIT_AMOUNT_CENTS,
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
      : AUTO_AUDIT_AMOUNT_CENTS;
    const stripeUnitAmount = isThreePayments
      ? Math.max(0, Math.round(finalAmountCents / 3))
      : finalAmountCents;

    if (finalAmountCents === 0) {
      await fulfillFreeAutoAudit({ email: clientEmail, offer });
      await markDiscountCodeUsed({
        discountCodeId: discount!.discountCodeId,
        clientEmail,
      });

      return NextResponse.json({
        ok: true,
        freeRedirectUrl: `${siteUrl}/paiement/auto-audit/succes?discount=1`,
      });
    }

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
            unit_amount: stripeUnitAmount,
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
        discount_code: discount?.valid ? discount.code : "",
        discount_code_id: discount?.valid ? discount.discountCodeId : "",
        original_amount_cents: String(AUTO_AUDIT_AMOUNT_CENTS),
        discount_amount_cents: String(discountAmountCents),
        final_amount_cents: String(finalAmountCents),
        client_email: clientEmail,
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
                discount_code: discount?.valid ? discount.code : "",
                discount_code_id: discount?.valid ? discount.discountCodeId : "",
                original_amount_cents: String(AUTO_AUDIT_AMOUNT_CENTS),
                discount_amount_cents: String(discountAmountCents),
                final_amount_cents: String(finalAmountCents),
                client_email: clientEmail,
              },
            },
          }
        : {
            payment_intent_data: {
              metadata: {
                product_key: "preaudit_qualiopi",
                offer,
                access_months: "3",
                discount_code: discount?.valid ? discount.code : "",
                discount_code_id: discount?.valid ? discount.discountCodeId : "",
                original_amount_cents: String(AUTO_AUDIT_AMOUNT_CENTS),
                discount_amount_cents: String(discountAmountCents),
                final_amount_cents: String(finalAmountCents),
                client_email: clientEmail,
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
