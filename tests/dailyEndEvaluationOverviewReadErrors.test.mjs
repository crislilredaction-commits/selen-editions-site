import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadRoute(admin) {
  const source = fs.readFileSync(new URL("../app/api/client/daily/end-evaluations/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const NextResponse = { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) };
  const dependencies = {
    "next/server": { NextResponse },
    "@/lib/server/agentAssistance": {
      getAssistanceTokenFromRequest: () => null,
      blockedAgentAssistanceResponse: () => ({ status: 403 }),
    },
    "@/lib/server/dailyOrganisationContext": {
      getDailyOrganisationReadContext: async () => ({
        ok: true, admin, organisationId: "of-a", capabilities: { sessions: true },
      }),
      getDailyOrganisationContext: async () => ({ ok: false, status: 403 }),
    },
    "@/lib/server/dailyEndEvaluations": { activeDailyEnrolment: () => true },
    "@/lib/server/dailyEndEvaluationLifecycle": {},
  };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Date, URL, console,
    require(id) {
      if (!(id in dependencies)) throw new Error("Unexpected dependency: " + id);
      return dependencies[id];
    },
  });
  return module.exports;
}

function makeAdmin(failingTable = null, missingSession = false) {
  const reads = [];
  const admin = {
    from(table) {
      const filters = [];
      const query = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        not() { return this; },
        is() { return this; },
        order() { return this; },
        maybeSingle() {
          reads.push({ table, filters });
          return Promise.resolve({
            data: missingSession ? null : { id: "session-a", end_date: "2026-10-30" },
            error: failingTable === table ? { message: "PRIVATE_SQL_ERROR: secret database details" } : null,
          });
        },
        then(resolve, reject) {
          reads.push({ table, filters });
          return Promise.resolve({
            data: [],
            error: failingTable === table ? { message: "PRIVATE_SQL_ERROR: secret database details" } : null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { admin, reads };
}

const overviewTables = [
  "daily_sessions",
  "daily_session_enrolments",
  "daily_learning_assessments",
  "daily_learner_feedback_responses",
  "daily_learning_assessment_responses",
  "daily_documents",
];

for (const table of overviewTables) {
  test("P0: overview masks SQL failure from " + table, async () => {
    const { admin, reads } = makeAdmin(table);
    const response = await loadRoute(admin).GET(new Request("https://example.test/api/client/daily/end-evaluations?session_id=session-a"));
    assert.equal(response.status, 503);
    assert.equal(response.body.error, "Impossible de charger les évaluations pour le moment.");
    assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE_SQL_ERROR|secret database details/);
    assert.ok(reads.some((read) => read.table === table));
    assert.ok(reads.every((read) => read.filters.some(([key, value]) => key === "organisation_id" && value === "of-a")));
  });
}

test("P0: session list masks SQL failure without exposing database details", async () => {
  const { admin } = makeAdmin("daily_sessions");
  const response = await loadRoute(admin).GET(new Request("https://example.test/api/client/daily/end-evaluations"));
  assert.equal(response.status, 503);
  assert.equal(response.body.error, "Impossible de charger les sessions pour le moment.");
  assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE_SQL_ERROR/);
});

test("P0: missing session remains a 404", async () => {
  const { admin } = makeAdmin(null, true);
  const response = await loadRoute(admin).GET(new Request("https://example.test/api/client/daily/end-evaluations?session_id=missing"));
  assert.equal(response.status, 404);
});

test("P0: successful overview keeps the expected response shape", async () => {
  const { admin } = makeAdmin();
  const response = await loadRoute(admin).GET(new Request("https://example.test/api/client/daily/end-evaluations?session_id=session-a"));
  assert.equal(response.status, 200);
  assert.equal(response.body.overview.session.id, "session-a");
  assert.ok(Array.isArray(response.body.overview.enrolments));
  assert.ok(Array.isArray(response.body.overview.assessments));
});
