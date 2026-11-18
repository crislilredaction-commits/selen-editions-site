import type { Stripe } from "stripe";

export type DailyInvoiceForwardPayload = {
  stripeInvoiceId: string;
};

/**
 * Forward only the Stripe invoice identifier. Studio must independently
 * retrieve and verify the invoice from Stripe before issuing anything.
 * Disabled by default; do not configure until the Studio endpoint is ready.
 */
export async function forwardPaidDailyInvoiceToStudio(
  invoice: Pick<Stripe.Invoice, "id">,
): Promise<"disabled" | "forwarded"> {
  if (process.env.SELEN_DAILY_INVOICE_FORWARD_ENABLED !== "true") {
    return "disabled";
  }

  const url = process.env.SELEN_STUDIO_DAILY_INVOICE_ISSUE_URL?.trim();
  const secret = process.env.SELEN_DAILY_INVOICE_INTERNAL_SECRET?.trim();
  if (!url || !secret || secret.length < 32) {
    throw new Error("Daily invoice forwarding enabled without complete server configuration.");
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(parsed.hostname === "localhost" && parsed.protocol === "http:")) {
    throw new Error("Daily invoice forwarding requires HTTPS.");
  }
  if (!invoice.id || !/^in_[A-Za-z0-9]+$/.test(invoice.id)) {
    throw new Error("Invalid Stripe invoice identifier.");
  }

  const response = await fetch(parsed.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ stripeInvoiceId: invoice.id } satisfies DailyInvoiceForwardPayload),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Studio Daily invoice endpoint returned HTTP ${response.status}`);
  }
  const receipt = await response.json();
  if (receipt?.stripeInvoiceId !== invoice.id || !["sent", "historical"].includes(receipt.status)) {
    throw new Error("Studio has not confirmed completion for this invoice.");
  }
  return "forwarded";
}
