import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isActivePortalAttendanceToken } from "../lib/daily/portalAttendanceAccess.mjs";

const source = fs.readFileSync("app/api/daily-portal/[token]/satisfaction/route.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ role = "trainer", failure = "", duplicate = false, status = "viewed" } = {}) {
  const reads = [];
  const writes = [];
  const access = {
    id: "access-1", session_id: "session-1", portal_type: role, entity_key: "recipient-1",
    entity_name: "Example", entity_email: "recipient@example.test", status, expires_at: null,
  };
  const session = {
    id: "session-1", organisation_id: "of-1", internal_reference: "SESSION-1",
    end_date: "2020-01-01", daily_formations: { title: "Formation test" },
  };
  const sqlError = { message: "PRIVATE SQL: relation daily_stakeholder_satisfaction_responses does not exist" };
  const admin = {
    from(table) {
      const filters = [];
      let operation = "read";
      const query = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        neq() { return this; },
        in(key, values) { filters.push([key, values]); return this; },
        insert(value) { operation = "insert"; writes.push({ table, operation, value, filters }); return this; },
        update(value) { operation = "update"; writes.push({ table, operation, value, filters }); return this; },
        maybeSingle() {
          reads.push({ table, filters });
          const data = table === "daily_portal_access_tokens" ? access
            : table === "daily_sessions" ? session : null;
          return Promise.resolve({ data, error: failure === table ? sqlError : null });
        },
        single() {
          return Promise.resolve({
            data: failure === "insert" || duplicate ? null : { id: "response-1", submitted_at: "2026-11-01T12:00:00Z" },
            error: duplicate ? { code: "23505", message: "PRIVATE SQL unique violation" }
              : failure === "insert" ? sqlError : null,
          });
        },
        then(resolve, reject) {
          return Promise.resolve({
            data: null,
            error: failure === "followup" && table === "daily_quality_actions" ? sqlError : null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const module = { exports: {} };
  const NextResponse = { json: (body, options = {}) => ({
    status: options.status ?? 200, body, headers: options.headers ?? {},
  }) };
  const requireMock = (id) => {
    if (id === "next/server") return { NextResponse };
    if (id === "@/lib/server/clientNdaAccess") return { getAdminSupabase: () => admin };
    if (id === "@/lib/daily/portalAttendanceAccess.mjs") return { isActivePortalAttendanceToken };
    throw new Error("Unexpected import " + id);
  };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: requireMock, Date, Intl,
    console: { error() {} } });
  const params = { params: Promise.resolve({ token: "secret-token" }) };
  return {
    reads, writes,
    get: () => module.exports.GET({}, params),
    post: () => module.exports.POST({ json: async () => ({ overall_rating: 5 }) }, params),
  };
}

for (const role of ["trainer", "enterprise"]) {
  for (const table of ["daily_portal_access_tokens", "daily_sessions", "daily_stakeholder_satisfaction_responses"]) {
    test(`P0 ${role}: GET read failure ${table} is private, retryable and uncached`, async () => {
      const f = fixture({ role, failure: table });
      const response = await f.get();
      assert.equal(response.status, 503);
      assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE SQL|relation/i);
      assert.equal(response.headers["Cache-Control"], "private, no-store");
      assert.equal(f.writes.length, 0);
    });
  }
  for (const failure of ["daily_portal_access_tokens", "daily_sessions", "daily_stakeholder_satisfaction_responses", "insert"]) {
    test(`P0 ${role}: POST failure ${failure} never claims submission`, async () => {
      const f = fixture({ role, failure });
      const response = await f.post();
      assert.equal(response.status, 503);
      assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE SQL|relation/i);
      assert.equal(response.headers["Cache-Control"], "private, no-store");
      assert.notEqual(response.body.ok, true);
    });
  }
  test(`P0 ${role}: concurrent duplicate is a 409 and never closes tasks`, async () => {
    const f = fixture({ role, duplicate: true });
    const response = await f.post();
    assert.equal(response.status, 409);
    assert.equal(f.writes.filter((w) => w.table === "daily_quality_actions").length, 0);
  });
  test(`P0 ${role}: stored response survives failed task synchronization with explicit warning`, async () => {
    const f = fixture({ role, failure: "followup" });
    const response = await f.post();
    assert.equal(response.status, 202);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.followupPending, true);
    assert.match(response.body.warning, /enregistrée/);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
    assert.equal(f.writes.filter((w) => w.table === "daily_stakeholder_satisfaction_responses").length, 1);
    const followup = f.writes.find((w) => w.table === "daily_quality_actions");
    assert.ok(followup);
    assert.ok(followup.filters.some(([key, value]) => key === "organisation_id" && value === "of-1"));
    assert.ok(followup.filters.some(([key, value]) => key === "source_id" && value === "access-1"));
  });
  test(`P0 ${role}: successful submission confirms follow-up and preserves OF scope`, async () => {
    const f = fixture({ role });
    const response = await f.post();
    assert.equal(response.status, 201);
    assert.equal(response.body.followupPending, false);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
    assert.equal(f.writes[0].value.organisation_id, "of-1");
  });
  test(`P0 ${role}: revoked access does not read session or write data`, async () => {
    const f = fixture({ role, status: "revoked" });
    const response = await f.post();
    assert.equal(response.status, 403);
    assert.equal(f.reads.length, 1);
    assert.equal(f.writes.length, 0);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
  });
}
