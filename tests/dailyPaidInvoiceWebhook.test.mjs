import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const webhook = readFileSync(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8");
const resolver = readFileSync(new URL("../lib/server/paidDailyInvoice.ts", import.meta.url), "utf8");

test("Stripe paid invoice is gated by signed webhook and Daily subscription metadata", () => {
  assert.match(webhook, /stripe\.webhooks\.constructEvent\(/);
  assert.match(webhook, /event\.type === "invoice\.paid"/);
  assert.match(webhook, /resolvePaidDailyInvoice\(stripe,/);
  assert.match(resolver, /invoice\.status !== "paid"/);
  assert.match(resolver, /invoice\.amount_remaining !== 0/);
  assert.match(resolver, /subscription\.metadata\?\.product_key !== "selen_daily"/);
});

test("paid invoice hook is observation-only until Studio issuance is transactional", () => {
  assert.match(webhook, /daily_invoice_paid_awaiting_studio_integration/);
  assert.doesNotMatch(webhook, /sendDailyInvoiceEmail\(/);
});
