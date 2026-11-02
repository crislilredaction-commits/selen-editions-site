import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

function fixture({ organisationId = "of-a", fail = "", duplicate = false, forbidden = false } = {}) {
  const reads = [];
  const writes = [];
  const admin = {
    from(table) {
      let operation = "read";
      let payload;
      const filters = [];
      const query = {
        select() { return this; },
        eq(key, value) { filters.push(["eq", key, value]); return this; },
        in(key, value) { filters.push(["in", key, value]); return this; },
        order() { return this; },
        insert(value) { operation = "insert"; payload = value; return this; },
        result(list = false) {
          const error = fail === table + ":" + operation
            ? { message: "PRIVATE_SQL_ERROR", code: "DB_DOWN" }
            : duplicate && table === "daily_stakeholder_satisfaction_responses" && operation === "insert"
              ? { message: "PRIVATE_SQL_ERROR", code: "23505" } : null;
          const rows = {
            daily_session_dossiers: list ? [{ session_id: "session-a" }] : { id: "dossier-a", status: "completed" },
            daily_sessions: list
              ? [{ id: "session-a", internal_reference: "SESSION-A", end_date: "2026-11-01", daily_formations: { title: "Formation fictive" } }]
              : { id: "session-a", internal_reference: "SESSION-A", daily_formations: { title: "Formation fictive" } },
            daily_stakeholder_satisfaction_responses: list ? [] : null,
          };
          if (operation === "read") reads.push({ table, filters: [...filters] });
          else writes.push({ table, operation, payload, filters: [...filters] });
          return {
            data: operation === "insert"
              ? (table === "daily_stakeholder_satisfaction_responses" ? { id: "response-a", submitted_at: "2026-11-02T09:00:00Z" } : null)
              : (rows[table] ?? null),
            error,
          };
        },
        maybeSingle() { return Promise.resolve(this.result(false)); },
        single() { return Promise.resolve(this.result(false)); },
        then(resolve, reject) { return Promise.resolve(this.result(true)).then(resolve, reject); },
      };
      return query;
    },
  };
  const context = forbidden ? { ok: false, status: 403, error: "Accès refusé." } : {
    ok: true, admin, organisationId, assisted: false, user: { id: "of-manager", email: "of@example.test" },
  };
  const route = loadTypeScript("app/api/client/daily/of-satisfaction/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({
      body, status: options.status ?? 200, headers: options.headers ?? {},
    }) } },
    "@/lib/server/dailyOrganisationContext": {
      getDailyOrganisationContext: async () => context,
      getDailyOrganisationReadContext: async () => context,
    },
  }, { Date, console });
  return {
    route, reads, writes,
    get: () => route.GET({ url: "https://selen.example.test/api/client/daily/of-satisfaction" }),
    post: () => route.POST({ json: async () => ({ session_id: "session-a", overall_rating: 4 }) }),
  };
}

for (const organisationId of ["of-a", "of-b"]) {
  test("P0-04: OF satisfaction reads and writes stay scoped to " + organisationId, async () => {
    const f = fixture({ organisationId });
    const list = await f.get();
    assert.equal(list.status, 200);
    assert.equal(list.headers["Cache-Control"], "private, no-store");
    const result = await f.post();
    assert.equal(result.status, 201);
    assert.equal(result.headers["Cache-Control"], "private, no-store");
    assert.equal(f.writes[0].payload.organisation_id, organisationId);
    for (const read of f.reads) {
      assert.ok(read.filters.some(([kind, key, value]) => kind === "eq" && key === "organisation_id" && value === organisationId),
        "Missing OF scope on " + read.table);
    }
  });
}

for (const table of ["daily_session_dossiers", "daily_sessions", "daily_stakeholder_satisfaction_responses"]) {
  test("P0-04: GET " + table + " failure does not expose private SQL", async () => {
    const f = fixture({ fail: table + ":read" });
    const response = await f.get();
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE_SQL_ERROR/);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
    assert.equal(f.writes.length, 0);
  });
  test("P0-04: POST " + table + " failure cannot create a satisfaction response", async () => {
    const f = fixture({ fail: table + ":read" });
    const response = await f.post();
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE_SQL_ERROR/);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
    assert.equal(f.writes.length, 0);
  });
}

test("P0-04: concurrent duplicate is a safe conflict without a follow-up note", async () => {
  const f = fixture({ duplicate: true });
  const response = await f.post();
  assert.equal(response.status, 409);
  assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE_SQL_ERROR/);
  assert.equal(f.writes.filter(x => x.table === "daily_session_followup_entries").length, 0);
});

test("P0-04: insert SQL failure is retryable and cannot create a follow-up note", async () => {
  const f = fixture({ fail: "daily_stakeholder_satisfaction_responses:insert" });
  const response = await f.post();
  assert.equal(response.status, 503);
  assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE_SQL_ERROR/);
  assert.equal(f.writes.filter(x => x.table === "daily_session_followup_entries").length, 0);
});

test("P0-04: denied access performs no reads or writes", async () => {
  const f = fixture({ forbidden: true });
  assert.equal((await f.get()).status, 403);
  assert.equal((await f.post()).status, 403);
  assert.equal(f.reads.length, 0);
  assert.equal(f.writes.length, 0);
});
