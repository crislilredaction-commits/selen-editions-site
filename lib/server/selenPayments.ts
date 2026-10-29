import type Stripe from "stripe";

import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type PaymentMetadata = Record<string, unknown>;

type RecordSelenPaymentInput = {
  clientEmail: string;
  prestationType: string;
  amountCents: number;
  originalAmountCents: number;
  discountAmountCents?: number;
  currency?: string | null;
  status?: string;
  stripeSessionId: string;
  stripePaymentIntentId?: string | null;
  paidAt?: string;
  metadata?: PaymentMetadata;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cents(value: unknown, fallback = 0) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : fallback;
}

function paymentIntentId(value: unknown) {
  if (!value) return null;
  return typeof value === "string"
    ? value
    : typeof value === "object" && "id" in value
      ? String(value.id)
      : null;
}

function metadataAmount(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
  fallback: number,
) {
  return cents(metadata?.[key], fallback);
}

export async function recordSelenPayment({
  clientEmail,
  prestationType,
  amountCents,
  originalAmountCents,
  discountAmountCents = 0,
  currency = "eur",
  status = "paid",
  stripeSessionId,
  stripePaymentIntentId = null,
  paidAt = new Date().toISOString(),
  metadata = {},
}: RecordSelenPaymentInput) {
  const supabase = getAdminSupabase();
  const normalizedEmail = clientEmail.trim().toLowerCase();

  if (!stripeSessionId) {
    throw new Error("stripe_session_id obligatoire pour selen_payments.");
  }

  const payload = {
    client_email: normalizedEmail,
    prestation_type: prestationType,
    amount_cents: amountCents,
    original_amount_cents: originalAmountCents,
    discount_amount_cents: discountAmountCents,
    currency: currency || "eur",
    status,
    stripe_session_id: stripeSessionId,
    stripe_payment_intent_id: stripePaymentIntentId,
    paid_at: paidAt,
    metadata,
  };

  const { data: existing, error: existingError } = await supabase
    .from("selen_payments")
    .select("id")
    .eq("stripe_session_id", stripeSessionId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("selen_payments")
      .update(payload)
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("selen_payments")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Paiement Selen non enregistré.");
  }

  return data.id as string;
}

export async function recordStripeCheckoutPayment(
  session: Stripe.Checkout.Session,
) {
  const metadata = session.metadata ?? {};
  const amountCents = cents(
    session.amount_total,
    metadataAmount(metadata, "final_amount_cents", 0),
  );
  const discountAmountCents = metadataAmount(
    metadata,
    "discount_amount_cents",
    0,
  );
  const originalAmountCents = metadataAmount(
    metadata,
    "original_amount_cents",
    amountCents + discountAmountCents,
  );
  const clientEmail =
    clean(metadata.client_email) ||
    clean(session.customer_details?.email) ||
    clean(session.customer_email);

  return recordSelenPayment({
    clientEmail,
    prestationType: clean(metadata.product_key) || "unknown",
    amountCents,
    originalAmountCents,
    discountAmountCents,
    currency: session.currency ?? "eur",
    stripeSessionId: session.id,
    stripePaymentIntentId: paymentIntentId(session.payment_intent),
    metadata: {
      ...metadata,
      stripe_mode: session.mode,
      stripe_payment_status: session.payment_status,
    },
  });
}
