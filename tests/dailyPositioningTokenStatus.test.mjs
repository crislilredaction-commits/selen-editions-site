import test from "node:test";
import assert from "node:assert/strict";
import { harness } from "./helpers/dailyOwnPositioningHarness.mjs";

const route = "app/api/daily-portal/[token]/positioning/route.ts";
const privateDocumentRoute = "app/api/daily-portal/[token]/positioning-document/route.ts";
const inactive = ["revoked", "expired", "suspended", "used", "sent", "unknown", "", null, undefined];

function setup(status, mode = "selen") {
  const h = harness();
  h.access.status = status;
  h.formation.positioning_mode = mode;
  if (mode === "selen") {
    h.formation.positioning_questionnaire_document_url = null;
    h.formation.positioning_questions = [{ id: "q1", label: "Objectif", type: "free_text", required: true, options: [] }];
  }
  const params = h.params("learner-token");
  const api = h.load(route);
  const get = () => api.GET(new Request("https://site.test/positioning"), params);
  const post = () => api.POST(new Request("https://site.test/positioning", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers: { q1: "Mon objectif" } }),
  }), params);
  return { h, get, post };
}

for (const mode of ["selen", "off_platform"]) {
  for (const method of ["get", "post"]) {
    test(`P0 positioning ${mode} ${method}: inactive and unknown links fail closed without mutations`, async () => {
      for (const status of inactive) {
        const { h, [method]: call } = setup(status, mode);
        const response = await call();
        assert.equal(response.status, 403, `${mode}/${method}/${String(status)}`);
        assert.equal(h.writes.length, 0);
        assert.equal(h.uploads.length, 0);
        assert.equal(h.downloads.length, 0);
        assert.equal(h.sends.length, 0);
      }
    });
  }
}

for (const status of ["pending", "viewed"]) {
  test(`P0 positioning ${status}: authorized Selen GET and POST remain functional`, async () => {
    const { h, get, post } = setup(status);
    assert.equal((await get()).status, 200);
    const response = await post();
    assert.equal(response.status, 200);
    assert.equal(h.db.daily_positioning_responses.length, 1);
    assert.equal(h.db.daily_positioning_responses[0].answers.q1, "Mon objectif");
    assert.equal(h.sends.length, 0);
  });
  test(`P0 positioning ${status}: authorized off-platform GET remains functional`, async () => {
    const { get } = setup(status, "off_platform");
    assert.equal((await get()).status, 200);
  });
}

test("P0 private learner original refuses sent, suspended and unknown links before storage access", async () => {
  for (const status of ["sent", "suspended", "unknown", null]) {
    const h = harness();
    h.access.status = status;
    const response = await h.load(privateDocumentRoute).GET(
      new Request("https://site.test/positioning-document"), h.params("learner-token"));
    assert.equal(response.status, 403, String(status));
    assert.equal(h.downloads.length, 0);
    assert.equal(h.writes.length, 0);
  }
});

// A corrupted expiry must never authorize reading a learner's positioning or its private PDF.
for (const mode of ["selen", "off_platform"]) {
  for (const method of ["get", "post"]) {
    test(`P0 positioning ${mode} ${method}: malformed and expired links fail closed before private reads`, async () => {
      for (const expiresAt of ["2020-01-01T00:00:00Z", "not-a-date", "", " ", 42]) {
        const { h, [method]: call } = setup("pending", mode);
        h.access.expires_at = expiresAt;
        const tables = [];
        const originalFrom = h.admin.from;
        h.admin.from = (table) => { tables.push(table); return originalFrom(table); };
        const response = await call();
        assert.equal(response.status, 410, `${mode}/${method}/${String(expiresAt)}`);
        assert.deepEqual(tables, ["daily_portal_access_tokens"]);
        assert.equal(h.writes.length, 0);
        assert.equal(h.uploads.length, 0);
        assert.equal(h.downloads.length, 0);
        assert.equal(h.sends.length, 0);
      }
    });
  }
}

test("P0 private learner positioning PDF: malformed expiry is rejected before session or Storage access", async () => {
  for (const expiresAt of ["2020-01-01T00:00:00Z", "broken", "", " ", 42]) {
    const h = harness();
    h.access.expires_at = expiresAt;
    const tables = [];
    const originalFrom = h.admin.from;
    h.admin.from = (table) => { tables.push(table); return originalFrom(table); };
    const response = await h.load(privateDocumentRoute).GET(
      new Request("https://site.test/positioning-document"), h.params("learner-token"));
    assert.equal(response.status, 410, String(expiresAt));
    assert.deepEqual(tables, ["daily_portal_access_tokens"]);
    assert.equal(h.downloads.length, 0);
    assert.equal(h.writes.length, 0);
  }
});

for (const mode of ["selen", "off_platform"]) {
  for (const expiresAt of [null, "2099-01-01T00:00:00Z"]) {
    test(`P0 positioning ${mode}: legitimate future and legacy null expiry remain accessible`, async () => {
      const { h, get } = setup("viewed", mode);
      h.access.expires_at = expiresAt;
      assert.equal((await get()).status, 200);
      assert.equal(h.sends.length, 0);
    });
  }
}
