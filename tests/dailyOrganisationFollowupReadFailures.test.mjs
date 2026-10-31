import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const organisationId = "of-test";
const sessionId = "session-test";
const requestId = "123e4567-e89b-42d3-a456-426614174000";

function fixture({ sessionError = false, sessionPresent = true, enrolmentError = false, forbidden = false } = {}) {
  const queries = [];
  const writes = [];
  const admin = {
    from(table) {
      const filters = [];
      return {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        async maybeSingle() {
          queries.push({ table, filters: [...filters] });
          if (table === "daily_sessions") {
            return {
              data: sessionError || !sessionPresent ? null : { id: sessionId },
              error: sessionError ? { message: "private SQL session detail" } : null,
            };
          }
          if (table === "daily_session_enrolments") {
            return {
              data: enrolmentError ? null : { id: "learner-test", status: "active" },
              error: enrolmentError ? { message: "private SQL enrolment detail" } : null,
            };
          }
          throw new Error("Unexpected read " + table);
        },
        insert() { writes.push(table); throw new Error("Unexpected write " + table); },
        update() { writes.push(table); throw new Error("Unexpected write " + table); },
      };
    },
  };
  const context = forbidden
    ? { ok: false, status: 403, error: "Accès refusé." }
    : { ok: true, admin, organisationId, capabilities: { sessions: true }, user: { id: "of-user" } };
  const route = loadTypeScript("app/api/client/daily/followup/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ status: options.status ?? 200, body }) } },
    "@/lib/server/agentAssistance": {
      blockedAgentAssistanceResponse: () => ({ status: 403 }),
      getAssistanceTokenFromRequest: () => null,
    },
    "@/lib/server/dailyOrganisationContext": {
      getDailyOrganisationContext: async () => context,
      getDailyOrganisationReadContext: async () => context,
    },
  });
  const get = () => route.GET({ url: "https://selen.example.test/api/client/daily/followup?session_id=" + sessionId });
  const post = () => route.POST({ json: async () => ({
    action: "create", session_id: sessionId, enrolment_id: "learner-test",
    entry_type: "incident", summary: "Incident à suivre", request_id: requestId,
  }) });
  return { get, post, queries, writes };
}

test("P0: panne SQL de session sur GET et POST = 503, jamais fausse 404", async () => {
  for (const verb of ["get", "post"]) {
    const f = fixture({ sessionError: true });
    const response = await f[verb]();
    assert.equal(response.status, 503, verb);
    assert.match(response.body.error, /Impossible de vérifier la session/);
    assert.doesNotMatch(JSON.stringify(response.body), /private SQL/);
    assert.deepEqual(f.queries.map(q => q.table), ["daily_sessions"]);
    assert.deepEqual(f.writes, []);
    assert.ok(f.queries[0].filters.some(([key, value]) => key === "organisation_id" && value === organisationId));
  }
});

test("P0: panne SQL de lecture d'inscription refuse la création sans écriture", async () => {
  const f = fixture({ enrolmentError: true });
  const response = await f.post();
  assert.equal(response.status, 503);
  assert.match(response.body.error, /Impossible de vérifier l'inscription/);
  assert.doesNotMatch(JSON.stringify(response.body), /private SQL/);
  assert.deepEqual(f.queries.map(q => q.table), ["daily_sessions", "daily_session_enrolments"]);
  assert.deepEqual(f.writes, []);
  for (const query of f.queries) {
    assert.ok(query.filters.some(([key, value]) => key === "organisation_id" && value === organisationId));
    assert.ok(query.filters.some(([key, value]) => key === "id" && value === sessionId) || query.table === "daily_session_enrolments");
  }
  assert.ok(f.queries[1].filters.some(([key, value]) => key === "session_id" && value === sessionId));
});

test("P0: vraie session absente reste 404, sans accès à un autre OF", async () => {
  for (const verb of ["get", "post"]) {
    const f = fixture({ sessionPresent: false });
    const response = await f[verb]();
    assert.equal(response.status, 404);
    assert.deepEqual(f.queries.map(q => q.table), ["daily_sessions"]);
    assert.deepEqual(f.writes, []);
  }
});

test("P0: accès OF refusé avant toute lecture et écriture", async () => {
  for (const verb of ["get", "post"]) {
    const f = fixture({ forbidden: true });
    const response = await f[verb]();
    assert.equal(response.status, 403);
    assert.deepEqual(f.queries, []);
    assert.deepEqual(f.writes, []);
  }
});
