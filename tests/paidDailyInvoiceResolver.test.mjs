import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/server/paidDailyInvoice.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const exports = {};
vm.runInNewContext(outputText, { exports });
const { resolvePaidDailyInvoice } = exports;

function paidInvoice(overrides = {}) {
  return {
    id: "in_test123",
    customer: "cus_test123",
    status: "paid",
    amount_remaining: 0,
    amount_paid: 8900,
    currency: "eur",
    parent: { type: "subscription_details", subscription_details: { subscription: "sub_test123" } },
    ...overrides,
  };
}
function stripe(productKey = "selen_daily") {
  const calls = [];
  return {
    calls,
    subscriptions: {
      retrieve: async (id) => {
        calls.push(id);
        return { metadata: { product_key: productKey } };
      },
    },
  };
}

test("valid settled Selen Daily subscription invoice is recognized", async () => {
  const client = stripe();
  const result = await resolvePaidDailyInvoice(client, paidInvoice());
  assert.equal(result.invoiceId, "in_test123");
  assert.equal(result.amountPaid, 8900);
  assert.equal(result.subscriptionId, "sub_test123");
  assert.deepEqual(client.calls, ["sub_test123"]);
});

test("unpaid and partially settled invoices never reach subscription lookup", async () => {
  for (const override of [
    { status: "open" },
    { amount_remaining: 1 },
    { customer: null },
    { parent: null },
  ]) {
    const client = stripe();
    assert.equal(await resolvePaidDailyInvoice(client, paidInvoice(override)), null);
    assert.equal(client.calls.length, 0);
  }
});

test("unrelated products and non-EUR invoices are rejected", async () => {
  assert.equal(await resolvePaidDailyInvoice(stripe("other_product"), paidInvoice()), null);
  assert.equal(await resolvePaidDailyInvoice(stripe(), paidInvoice({ currency: "usd" })), null);
});
