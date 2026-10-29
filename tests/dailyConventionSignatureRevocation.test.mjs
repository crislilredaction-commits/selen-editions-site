import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const routePath = "app/api/daily-signature/[token]/route.ts";
const downloadPath = "app/api/daily-signature/[token]/download/route.ts";
const next = { NextResponse: { json: (body, options) => Response.json(body, options), redirect: (url) => Response.redirect(url) } };
const tokenContext = { params: Promise.resolve({ token: "test-token" }) };

function fixture(status, { expiresAt = "2099-01-01T00:00:00Z", assistance = false } = {}) {
  const calls = { signedUrls: 0, updates: 0, dispatches: 0, reminders: 0 };
  const signature = {
    id: "signature-1", status, expires_at: expiresAt, convention_id: "convention-1",
    daily_conventions: { storage_path: "daily/contract.pdf", document_name: "contract.pdf" },
  };
  const query = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: signature, error: null }; },
    update() { calls.updates++; return this; },
  };
  const admin = {
    from() { return query; },
    storage: { from() { return { async createSignedUrl() {
      calls.signedUrls++;
      return { data: { signedUrl: "https://storage.example.test/contract.pdf" }, error: null };
    } }; } },
  };
  const assistanceFns = {
    getAssistanceTokenFromRequest: () => assistance ? "agent-token" : "",
    verifyAgentAssistance: async () => assistance ? { id: "agent" } : null,
    blockedAgentAssistanceResponse: () => Response.json({ assistanceBlocked: true }, { status: 403 }),
  };
  const dependencies = {
    "next/server": next,
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
    "@/lib/server/agentAssistance": assistanceFns,
  };
  const download = loadTypeScript(downloadPath, dependencies, { Response, Request });
  const signatureRoute = loadTypeScript(routePath, {
    ...dependencies,
    crypto: { createHash: () => ({ update() { return this; }, digest: () => "hash" }) },
    "@/lib/server/dailySignedConventionPretrainingPack": {
      dispatchPretrainingPackAfterConventionSigned: async () => { calls.dispatches++; return { status: "sent" }; },
    },
    "@/lib/server/dailyPostSignatureLearnerAccess": { sendPostSignatureLearnerAccess: async () => [] },
    "@/lib/server/dailySignatureFollowupReminders": {
      resolveDailySignatureFollowupReminder: async () => { calls.reminders++; },
    },
    "@/lib/dailyIndividualEarlyStart": {
      getContractEarlyStartContext: () => ({ earlyStartApplicable: false, individual: false }),
      individualEarlyStartRequestText: () => "",
      INDIVIDUAL_FULL_PERFORMANCE_ACKNOWLEDGEMENT_TEXT: "",
      INDIVIDUAL_EARLY_START_TEXT_VERSION: "v1",
    },
  }, { Response, Request, Date, URL });
  return { calls, download, signatureRoute };
}

const request = () => new Request("https://daily.example.test/api/daily-signature/test-token");
const signRequest = () => new Request("https://daily.example.test/api/daily-signature/test-token", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ consent: true, signature_data: "data:image/png;base64,AAAA" }),
});

for (const status of ["revoked", "cancelled", "expired", "invalid"]) {
  test(`signature ${status} : consultation, signature et téléchargement refusés`, async () => {
    const { calls, download, signatureRoute } = fixture(status);
    assert.equal((await signatureRoute.GET(request(), tokenContext)).status, 410);
    assert.equal((await signatureRoute.POST(signRequest(), tokenContext)).status, 410);
    assert.equal((await download.GET(request(), tokenContext)).status, 410);
    assert.equal(calls.signedUrls, 0);
    assert.equal(calls.updates, 0);
    assert.equal(calls.dispatches, 0);
    assert.equal(calls.reminders, 0);
  });
}

test("assistance agent : signature POST et téléchargement bloqués sans effet métier", async () => {
  const { calls, download, signatureRoute } = fixture("pending", { assistance: true });
  assert.equal((await signatureRoute.POST(signRequest(), tokenContext)).status, 403);
  assert.equal((await download.GET(request(), tokenContext)).status, 403);
  assert.equal(calls.signedUrls, 0);
  assert.equal(calls.updates, 0);
});

for (const status of ["pending", "viewed", "signed"]) {
  test(`lien ${status} : téléchargement de convention conservé`, async () => {
    const { calls, download } = fixture(status);
    const response = await download.GET(request(), tokenContext);
    assert.equal(response.status, 307);
    assert.equal(calls.signedUrls, 1);
  });
}

test("lien en attente expiré refusé ; convention déjà signée toujours téléchargeable", async () => {
  const expired = { expiresAt: "2000-01-01T00:00:00Z" };
  assert.equal((await fixture("pending", expired).download.GET(request(), tokenContext)).status, 410);
  assert.equal((await fixture("signed", expired).download.GET(request(), tokenContext)).status, 307);
});
