import type Stripe from "stripe";

/** Only subscription invoices explicitly tagged as Selen Daily are eligible.
 * Never infer the product from customer email, price, or checkout metadata alone.
 */
export async function resolvePaidDailyInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<{ invoiceId: string; subscriptionId: string; customerId: string; amountPaid: number; currency: string } | null> {
  if (invoice.status !== "paid" || !invoice.paid || invoice.amount_remaining !== 0) return null;
  if (!invoice.id || !invoice.customer || typeof invoice.customer !== "string") return null;

  // Stripe API versions differ: newer invoices may expose subscription via
  // parent.subscription_details.subscription rather than invoice.subscription.
  const parent = invoice.parent;
  const subRef = parent?.type === "subscription_details"
    ? parent.subscription_details?.subscription
    : null;
  if (!subRef) return null;
  const subscriptionId = typeof subRef === "string" ? subRef : subRef.id;
  if (!subscriptionId) return null;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.metadata?.product_key !== "selen_daily") return null;
  if (typeof invoice.amount_paid !== "number" || invoice.amount_paid < 0) return null;
  if (invoice.currency !== "eur") return null;

  return {
    invoiceId: invoice.id,
    subscriptionId,
    customerId: invoice.customer,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
  };
}
