import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/server/forwardDailyInvoiceToStudio.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function load({ env = {}, fetchImpl = async () => ({ ok: true, json: async () => ({stripeInvoiceId:"in_123",status:"sent"}) }) } = {}) {
  const exports = {};
  const calls = [];
  const context = {
    exports,
    process: { env },
    URL,
    AbortSignal,
    fetch: async (...args) => { calls.push(args); return fetchImpl(...args); },
  };
  vm.runInNewContext(outputText, context);
  return { forward: exports.forwardPaidDailyInvoiceToStudio, calls };
}

test("forwarding is disabled by default without network access", async () => {
  const { forward, calls } = load();
  assert.equal(await forward({ id: "in_123" }), "disabled");
  assert.equal(calls.length, 0);
});

test("forwarding rejects missing secret and non-HTTPS URLs", async () => {
  const secret = "x".repeat(40);
  for (const env of [
    { SELEN_DAILY_INVOICE_FORWARD_ENABLED: "true", SELEN_STUDIO_DAILY_INVOICE_ISSUE_URL: "https://studio.example.com" },
    { SELEN_DAILY_INVOICE_FORWARD_ENABLED: "true", SELEN_STUDIO_DAILY_INVOICE_ISSUE_URL: "http://studio.example.com", SELEN_DAILY_INVOICE_INTERNAL_SECRET: secret },
  ]) {
    const { forward, calls } = load({ env });
    await assert.rejects(forward({ id: "in_123" }));
    assert.equal(calls.length, 0);
  }
});

test("forwarding sends only the invoice id with server secret", async () => {
  const secret = "x".repeat(40);
  const { forward, calls } = load({ env: {
    SELEN_DAILY_INVOICE_FORWARD_ENABLED: "true",
    SELEN_STUDIO_DAILY_INVOICE_ISSUE_URL: "https://studio.example.com/api/internal/daily-invoices/issue",
    SELEN_DAILY_INVOICE_INTERNAL_SECRET: secret,
  } });
  assert.equal(await forward({ id: "in_123" }), "forwarded");
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0][1].body).stripeInvoiceId, "in_123");
  assert.equal(calls[0][1].headers.Authorization, `Bearer ${secret}`);
});

test("Studio HTTP errors cause a retryable webhook failure", async () => {
  const { forward } = load({ env: {
    SELEN_DAILY_INVOICE_FORWARD_ENABLED: "true",
    SELEN_STUDIO_DAILY_INVOICE_ISSUE_URL: "https://studio.example.com",
    SELEN_DAILY_INVOICE_INTERNAL_SECRET: "x".repeat(40),
  }, fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(forward({ id: "in_123" }), /HTTP 503/);
});

test("a 2xx response for another invoice or an unfinished delivery must be retried", async () => {
  for (const receipt of [{status:"sent",stripeInvoiceId:"in_other"},{status:"pending",stripeInvoiceId:"in_123"}]) {
    const { forward } = load({env:{
      SELEN_DAILY_INVOICE_FORWARD_ENABLED:"true",SELEN_STUDIO_DAILY_INVOICE_ISSUE_URL:"https://studio.example.com",
      SELEN_DAILY_INVOICE_INTERNAL_SECRET:"x".repeat(40),
    },fetchImpl:async()=>({ok:true,json:async()=>receipt})});
    await assert.rejects(forward({id:"in_123"}),/not confirmed/);
  }
});
