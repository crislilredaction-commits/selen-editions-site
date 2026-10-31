import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(path, dependencies) {
  const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Date, URL, console,
    require(id) {
      if (!(id in dependencies)) throw new Error("Unexpected dependency: " + id);
      return dependencies[id];
    },
  });
  return module.exports;
}

function makeAdmin(failure = {}) {
  const writes = [];
  const data = {
    daily_sessions: { id: "session-1", end_date: "2026-10-30" },
    daily_session_enrolments: { id: "learner-1", status: "active" },
    daily_learning_assessments: [{ enrolment_id: "learner-1", outcome: "achieved" }],
    daily_learner_feedback_responses: [{ enrolment_id: "learner-1" }],
  };
  const admin = {
    from(table) {
      let operation = "read";
      const filters = [];
      const query = {
        select() { return this; },
        eq(key, value) { filters.push(["eq", key, value]); return this; },
        neq(key, value) { filters.push(["neq", key, value]); return this; },
        update(value) { operation = "update"; writes.push({ table, operation, value, filters }); return this; },
        upsert(value) { operation = "upsert"; writes.push({ table, operation, value, filters }); return this; },
        insert(value) { operation = "insert"; writes.push({ table, operation, value, filters }); return this; },
        result(asList = false) {
          const phase = filters.some(([kind, key]) => kind === "eq" && key === "token_hash") ? "compensation" : "rotation";
          const failed = failure.table === table && failure.operation === operation && (!failure.phase || failure.phase === phase);
          const value = data[table] ?? null;
          return {
            data: asList && table === "daily_session_enrolments" ? [value] : value,
            error: failed ? { message: "PRIVATE_SQL_ERROR" } : null,
          };
        },
        maybeSingle() { return Promise.resolve(this.result()); },
        single() { return Promise.resolve(this.result()); },
        then(resolve, reject) { return Promise.resolve(this.result(true)).then(resolve, reject); },
      };
      return query;
    },
  };
  return { admin, writes };
}

function routeWith(admin) {
  const NextResponse = { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) };
  return load("app/api/client/daily/end-evaluations/route.ts", {
    "next/server": { NextResponse },
    "@/lib/server/agentAssistance": {
      getAssistanceTokenFromRequest: () => null,
      blockedAgentAssistanceResponse: () => ({ status: 403 }),
    },
    "@/lib/server/dailyOrganisationContext": {
      getDailyOrganisationContext: async () => ({
        ok: true, admin, organisationId: "of-1", user: { id: "staff-1" },
      }),
      getDailyOrganisationReadContext: async () => ({ ok: false, status: 403 }),
    },
    "@/lib/server/dailyEndEvaluations": {
      activeDailyEnrolment: (status) => status === "active",
      createDailyFeedbackToken: () => ({ token: "test-token", tokenHash: "test-hash" }),
      dailyFeedbackPath: (token) => "/daily-satisfaction/" + token,
      dailyFeedbackExpiresAt: () => "2026-11-30T00:00:00.000Z",
    },
    "@/lib/server/dailyEndEvaluationLifecycle": {
      refreshDailyEndEvaluationsChecklist: async () => {},
      tryEnsureDailyPosttrainingDocuments: async () => {},
    },
  });
}

function lifecycleWith(admin) {
  return load("lib/server/dailyEndEvaluationLifecycle.ts", {
    "@/lib/server/dailyEndEvaluations": {
      activeDailyEnrolment: (status) => status === "active",
    },
    "@/lib/server/dailyPosttrainingDocuments": { ensurePosttrainingDocuments: async () => {} },
    "@/lib/server/clientNdaAccess": {},
  });
}

function request(action) {
  return { json: async () => ({
    action, session_id: "session-1", enrolment_id: "learner-1", outcome: "achieved",
  }) };
}

test("P0: session SQL failure is not a false 404 and never writes", async () => {
  const { admin, writes } = makeAdmin({ table: "daily_sessions", operation: "read" });
  const response = await routeWith(admin).POST(request("save_assessment"));
  assert.equal(response.status, 503);
  assert.doesNotMatch(response.body.error, /PRIVATE_SQL_ERROR/);
  assert.equal(writes.length, 0);
});

for (const action of ["save_assessment", "create_feedback_link"]) {
  test("P0: " + action + " blocks on enrolment read failure", async () => {
    const { admin, writes } = makeAdmin({ table: "daily_session_enrolments", operation: "read" });
    const response = await routeWith(admin).POST(request(action));
    assert.equal(response.status, 503);
    assert.doesNotMatch(response.body.error, /PRIVATE_SQL_ERROR/);
    assert.equal(writes.length, 0);
  });
}

test("P0: failed new-token insertion preserves the previous satisfaction link", async () => {
  const { admin, writes } = makeAdmin({ table: "daily_learner_feedback_tokens", operation: "insert" });
  const response = await routeWith(admin).POST(request("create_feedback_link"));
  assert.equal(response.status, 503);
  assert.deepEqual(writes.map((write) => write.operation), ["insert"]);
  assert.equal(response.body.path, undefined);
  assert.doesNotMatch(response.body.error, /PRIVATE_SQL_ERROR/);
});

test("P0: failed old-token revocation compensates the replacement without returning its link", async () => {
  const { admin, writes } = makeAdmin({ table: "daily_learner_feedback_tokens", operation: "update", phase: "rotation" });
  const response = await routeWith(admin).POST(request("create_feedback_link"));
  assert.equal(response.status, 503);
  assert.equal(response.body.path, undefined);
  assert.deepEqual(writes.map((write) => write.operation), ["insert", "update", "update"]);
  assert.deepEqual(writes[1].filters.at(-1), ["neq", "token_hash", "test-hash"]);
  assert.ok(writes[2].filters.some((filter) => filter[0] === "eq" && filter[1] === "token_hash" && filter[2] === "test-hash"));
  assert.doesNotMatch(response.body.error, /PRIVATE_SQL_ERROR/);
});

test("P0: valid enrolment rotates a scoped feedback link only after insertion", async () => {
  const { admin, writes } = makeAdmin();
  const response = await routeWith(admin).POST(request("create_feedback_link"));
  assert.equal(response.status, 200);
  assert.equal(response.body.path, "/daily-satisfaction/test-token");
  assert.deepEqual(writes.map((write) => write.operation), ["insert", "update"]);
  assert.equal(writes[0].value.organisation_id, "of-1");
  assert.equal(writes[0].value.enrolment_id, "learner-1");
  for (const key of ["organisation_id", "session_id", "enrolment_id", "status"]) {
    assert.ok(writes[1].filters.some((filter) => filter[0] === "eq" && filter[1] === key));
  }
  assert.deepEqual(writes[1].filters.at(-1), ["neq", "token_hash", "test-hash"]);
});

for (const table of ["daily_session_enrolments", "daily_learning_assessments", "daily_learner_feedback_responses"]) {
  test("P0: checklist never changes on failed " + table + " read", async () => {
    const { admin, writes } = makeAdmin({ table, operation: "read" });
    await assert.rejects(
      lifecycleWith(admin).refreshDailyEndEvaluationsChecklist(admin, "of-1", "session-1"),
      /Impossible de vérifier les évaluations/,
    );
    assert.equal(writes.length, 0);
  });
}

test("P0: checklist write failure is not silently reported as success", async () => {
  const { admin } = makeAdmin({ table: "daily_session_checklist_items", operation: "update" });
  await assert.rejects(
    lifecycleWith(admin).refreshDailyEndEvaluationsChecklist(admin, "of-1", "session-1"),
    /Impossible de synchroniser/,
  );
});

test("P0: complete end evaluations still reach to_review when all reads succeed", async () => {
  const { admin, writes } = makeAdmin();
  await lifecycleWith(admin).refreshDailyEndEvaluationsChecklist(admin, "of-1", "session-1");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, "daily_session_checklist_items");
  assert.equal(writes[0].value.status, "to_review");
});
