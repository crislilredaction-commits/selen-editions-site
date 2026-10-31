import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const routePath = "app/api/client/daily/end-evaluations/send-satisfaction/route.ts";

function fixture({ fail = "", sent = true, forbidden = false } = {}) {
  const operations = [];
  const sends = [];
  const organisationId = "of-a";
  const admin = {
    from(table) {
      let operation = "read";
      let payload;
      const filters = [];
      const query = {
        select() { return this; },
        eq(key, value) { filters.push(["eq", key, value]); return this; },
        neq(key, value) { filters.push(["neq", key, value]); return this; },
        update(value) { operation = "update"; payload = value; return this; },
        insert(value) { operation = "insert"; payload = value; return this; },
        result() {
          if (operation !== "read") operations.push({ table, operation, payload, filters: [...filters] });
          const error = fail === table + ":" + operation ? { message: "PRIVATE_SQL_ERROR" } : null;
          if (operation === "read") {
            const data = {
              daily_sessions: { id: "session-a", status: "active", end_date: "2026-10-31", daily_formations: { title: "Formation test" } },
              daily_session_enrolments: { id: "enrolment-a", status: "active", daily_learners: { first_name: "Camille", last_name: "Test", email: "camille@example.test" } },
              daily_learner_feedback_responses: null,
            };
            return { data: data[table] ?? null, error };
          }
          return { data: operation === "insert" ? { id: table === "daily_communications" ? "communication-a" : "token-a" } : null, error };
        },
        maybeSingle() { return Promise.resolve(this.result()); },
        single() { return Promise.resolve(this.result()); },
        then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); },
      };
      return query;
    },
  };
  const route = loadTypeScript(routePath, {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ status: options.status ?? 200, body }) } },
    "@/lib/server/dailyOrganisationContext": {
      getDailyOrganisationContext: async () => forbidden
        ? { ok: false, status: 403, error: "Accès refusé." }
        : { ok: true, admin, organisationId, assisted: false, user: { id: "of-user" } },
    },
    "@/lib/server/dailyEndEvaluations": {
      activeDailyEnrolment: (status) => status === "active",
      createDailyFeedbackToken: () => ({ token: "private-token", tokenHash: "hashed-token" }),
      dailyFeedbackPath: (token) => "/daily-feedback/" + token,
    },
    "@/lib/server/dailyEndEvaluationEmails": {
      prepareDailySatisfactionRequestEmail: () => ({ subject: "Satisfaction", text: "Texte", html: "<p>Texte</p>" }),
      sendDailySatisfactionRequest: async () => {
        sends.push("send");
        return sent ? { sent: true, message: { providerMessageId: "provider-a" } } : { sent: false, reason: "provider_unavailable" };
      },
    },
  }, { Date, console });
  const request = { url: "https://selen.example.test/api/client/daily/end-evaluations/send-satisfaction", json: async () => ({ session_id: "session-a", enrolment_id: "enrolment-a" }) };
  return { route, request, operations, sends, organisationId };
}

function oldLinkRevocations(f) {
  return f.operations.filter(op => op.table === "daily_learner_feedback_tokens"
    && op.operation === "update" && !op.filters.some(([kind, key]) => key === "id"));
}

test("P0: failed token insertion does not revoke the old satisfaction link or send", async () => {
  const f = fixture({ fail: "daily_learner_feedback_tokens:insert" });
  const result = await f.route.POST(f.request);
  assert.equal(result.status, 503);
  assert.equal(f.sends.length, 0);
  assert.equal(oldLinkRevocations(f).length, 0);
  assert.doesNotMatch(result.body.error, /PRIVATE_SQL_ERROR/);
});

test("P0: failed communication reservation preserves the old link and never sends", async () => {
  const f = fixture({ fail: "daily_communications:insert" });
  const result = await f.route.POST(f.request);
  assert.equal(result.status, 500);
  assert.equal(f.sends.length, 0);
  assert.equal(oldLinkRevocations(f).length, 0);
  assert.ok(f.operations.some(op => op.table === "daily_learner_feedback_tokens" && op.payload?.status === "revoked"));
});

test("P0: failed email revokes only the new link, leaving older links valid", async () => {
  const f = fixture({ sent: false });
  const result = await f.route.POST(f.request);
  assert.equal(result.status, 503);
  assert.deepEqual(f.sends, ["send"]);
  assert.equal(oldLinkRevocations(f).length, 0);
  assert.ok(f.operations.some(op => op.table === "daily_learner_feedback_tokens" && op.filters.some(([kind, key, value]) => kind === "eq" && key === "id" && value === "token-a")));
});

test("P0: successful delivery revokes older links only afterwards and within the OF", async () => {
  const f = fixture();
  const result = await f.route.POST(f.request);
  assert.equal(result.status, 200);
  assert.equal(result.body.previousLinksRevoked, true);
  assert.equal(f.sends.length, 1);
  const revocations = oldLinkRevocations(f);
  assert.equal(revocations.length, 1);
  assert.ok(revocations[0].filters.some(([kind, key, value]) => kind === "neq" && key === "token_hash" && value === "hashed-token"));
  for (const [key, value] of [["organisation_id", "of-a"], ["session_id", "session-a"], ["enrolment_id", "enrolment-a"], ["status", "active"]]) {
    assert.ok(revocations[0].filters.some(([kind, k, v]) => kind === "eq" && k === key && v === value));
  }
  assert.ok(f.operations.some(op => op.table === "daily_communications" && op.payload?.status === "sent"));
});

test("P0: failed revocation does not falsely report that a sent email failed", async () => {
  const f = fixture({ fail: "daily_learner_feedback_tokens:update" });
  const result = await f.route.POST(f.request);
  assert.equal(result.status, 200);
  assert.equal(result.body.previousLinksRevoked, false);
  assert.match(result.body.warning, /vérification/);
  assert.equal(f.sends.length, 1);
});

test("P0: unauthorised request never reads, writes or sends", async () => {
  const f = fixture({ forbidden: true });
  const result = await f.route.POST(f.request);
  assert.equal(result.status, 403);
  assert.equal(f.operations.length, 0);
  assert.equal(f.sends.length, 0);
});
