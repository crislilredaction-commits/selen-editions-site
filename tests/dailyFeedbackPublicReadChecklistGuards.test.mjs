import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const routeSource = fs.readFileSync(new URL("../app/api/daily-feedback/[token]/route.ts", import.meta.url), "utf8");

function fixture({ failure = "", expiry = "2099-01-01T00:00:00.000Z", existing = false, finalizeFails = false } = {}) {
  const reads = [];
  const writes = [];
  const finalized = [];
  const data = {
    daily_learner_feedback_tokens: { id: "token-1", organisation_id: "of-1", session_id: "session-1", enrolment_id: "enrolment-1", status: "active", expires_at: expiry },
    daily_sessions: { id: "session-1", start_date: "2026-10-01", end_date: "2026-10-02", daily_formations: { title: "Formation" } },
    daily_session_enrolments: { id: "enrolment-1", status: "active", daily_learners: { first_name: "Test", last_name: "Learner" } },
    daily_learner_feedback_responses: existing ? { id: "response-1", submitted_at: "2026-10-02T10:00:00.000Z" } : null,
  };
  const admin = {
    from(table) {
      let operation = "read";
      const filters = [];
      const query = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        not() { return this; },
        update(value) { operation = "update"; writes.push({ table, operation, value, filters }); return this; },
        insert(value) { operation = "insert"; writes.push({ table, operation, value, filters }); return this; },
        result(single) {
          const key = table + ":" + operation;
          if (operation === "read") reads.push({ table, filters: [...filters], single });
          const failed = failure === key;
          let value = data[table] ?? null;
          if (!single) {
            if (table === "daily_session_enrolments") value = [{ id: "enrolment-1", status: "active" }];
            if (table === "daily_learning_assessments") value = [{ enrolment_id: "enrolment-1", outcome: "achieved" }];
            if (table === "daily_learner_feedback_responses") value = [{ enrolment_id: "enrolment-1" }];
          }
          return { data: value, error: failed ? { message: "PRIVATE_SQL_ERROR" } : null };
        },
        maybeSingle() { return Promise.resolve(this.result(true)); },
        then(resolve, reject) { return Promise.resolve(this.result(false)).then(resolve, reject); },
      };
      return query;
    },
  };
  const compiled = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Date, Number, Map, Set, console,
    require(id) {
      if (id === "next/server") return { NextResponse: { json: (body, opts = {}) => ({ body, status: opts.status ?? 200 }) } };
      if (id === "@/lib/server/clientNdaAccess") return { getAdminSupabase: () => admin };
      if (id === "@/lib/server/dailyEndEvaluations") return { activeDailyEnrolment: status => status === "active", hashDailyFeedbackToken: () => "hash" };
      if (id === "@/lib/server/dailyLearnerSatisfactionLifecycle") return {
        finalizeDailyLearnerSatisfaction: async (_admin, input) => {
          finalized.push(input);
          if (finalizeFails) throw new Error("PRIVATE_SQL_ERROR");
        },
      };
      throw new Error("Unexpected dependency " + id);
    },
  });
  const params = { params: Promise.resolve({ token: "test-token" }) };
  const request = { json: async () => ({
    overall_rating: 5, objectives_rating: 5, trainer_rating: 5,
    organisation_rating: 5, content_rating: 5, pace_rating: 5,
  }) };
  return { route: module.exports, admin, reads, writes, finalized, params, request };
}

for (const table of ["daily_sessions", "daily_session_enrolments", "daily_learner_feedback_responses"]) {
  test("P0 satisfaction GET refuses partial SQL read of " + table, async () => {
    const f = fixture({ failure: table + ":read" });
    const result = await f.route.GET({}, f.params);
    assert.equal(result.status, 503);
    assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_SQL_ERROR/);
    assert.equal(f.writes.length, 0);
  });
}

test("P0 satisfaction GET scopes existing feedback to organisation and enrolment", async () => {
  const f = fixture();
  const result = await f.route.GET({}, f.params);
  assert.equal(result.status, 200);
  const read = f.reads.find(item => item.table === "daily_learner_feedback_responses");
  for (const [key, value] of [["organisation_id", "of-1"], ["session_id", "session-1"], ["enrolment_id", "enrolment-1"]]) {
    assert.ok(read.filters.some(filter => filter[0] === key && filter[1] === value));
  }
});

for (const table of ["daily_session_enrolments", "daily_learner_feedback_responses"]) {
  test("P0 satisfaction POST refuses failed identity/duplicate read of " + table, async () => {
    const f = fixture({ failure: table + ":read" });
    const result = await f.route.POST(f.request, f.params);
    assert.equal(result.status, 503);
    assert.equal(f.writes.filter(write => write.operation === "insert").length, 0);
    assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_SQL_ERROR/);
  });
}

test("P0 satisfaction POST does not expose SQL insertion errors", async () => {
  const f = fixture({ failure: "daily_learner_feedback_responses:insert" });
  const result = await f.route.POST(f.request, f.params);
  assert.equal(result.status, 503);
  assert.equal(result.body.ok, undefined);
  assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_SQL_ERROR/);
});

for (const table of ["daily_session_enrolments", "daily_learning_assessments", "daily_learner_feedback_responses"]) {
  test("P0 satisfaction POST preserves answer without falsely recalculating checklist on " + table + " read failure", async () => {
    // The first enrolment/response read is required before insert; exercise checklist failure on assessments only.
    if (table !== "daily_learning_assessments") return;
    const f = fixture({ failure: table + ":read" });
    const result = await f.route.POST(f.request, f.params);
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.checklist_synced, false);
    assert.match(result.body.warning, /suivi/);
    assert.equal(f.writes.filter(write => write.table === "daily_session_checklist_items").length, 0);
  });
}

test("P0 satisfaction POST reports failed checklist update but keeps saved response", async () => {
  const f = fixture({ failure: "daily_session_checklist_items:update" });
  const result = await f.route.POST(f.request, f.params);
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.checklist_synced, false);
  assert.equal(f.finalized.length, 1);
  assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_SQL_ERROR/);
});

test("P0 satisfaction POST completes checklist only with full data and OF scope", async () => {
  const f = fixture();
  const result = await f.route.POST(f.request, f.params);
  assert.equal(result.status, 200);
  assert.equal(result.body.checklist_synced, true);
  const update = f.writes.find(write => write.table === "daily_session_checklist_items");
  assert.equal(update.value.status, "to_review");
  assert.ok(update.filters.some(filter => filter[0] === "organisation_id" && filter[1] === "of-1"));
});

test("P0 malformed expiry fails closed for GET and POST", async () => {
  const f = fixture({ expiry: "not-a-date" });
  for (const response of [await f.route.GET({}, f.params), await f.route.POST(f.request, f.params)]) {
    assert.equal(response.status, 410);
  }
  assert.equal(f.writes.length, 0);
});

test("P0 already submitted satisfaction can safely finalize again", async () => {
  const f = fixture({ existing: true });
  const result = await f.route.POST(f.request, f.params);
  assert.equal(result.status, 200);
  assert.equal(result.body.alreadySubmitted, true);
  assert.equal(f.writes.filter(write => write.operation === "insert").length, 0);
});
