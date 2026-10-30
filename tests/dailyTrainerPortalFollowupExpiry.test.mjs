import { isValidPortalExpiry } from "../lib/daily/portalAttendanceAccess.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync("app/api/daily-portal/[token]/followup/route.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function makeTrainerPortal(expiresAt, options = {}) {
  const calls = [];
  const access = {
    id: "access-1", portal_type: options.role ?? "trainer", session_id: "session-1",
    status: options.status ?? "viewed", expires_at: expiresAt,
    entity_name: "Formateur test", entity_email: "formateur@example.test",
  };
  const session = { id: "session-1", organisation_id: "of-1" };
  const admin = {
    from(table) {
      const clauses = [];
      calls.push({ table, clauses });
      const query = {
        select() { return this; },
        eq(key, value) { clauses.push([key, value]); return this; },
        neq() { return this; },
        order() { return this; },
        maybeSingle() {
          return Promise.resolve({
            data: table === "daily_portal_access_tokens" ? access : table === "daily_sessions" ? session : null,
            error: null,
          });
        },
        then(resolve, reject) {
          return Promise.resolve({
            data: table === "daily_session_followup_entries" ? [{ id: "entry-1" }] : [],
            error: null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const exports = {};
  const module = { exports };
  const requireMock = (id) => {
    if (id === "next/server") return {
      NextResponse: { json: (body, init = {}) => ({ status: init.status ?? 200, body }) },
    };
    if (id === "@/lib/server/clientNdaAccess") return { getAdminSupabase: () => admin };
    if (id === "@/lib/daily/portalAttendanceAccess.mjs") return { isValidPortalExpiry };
    throw new Error("Unexpected dependency " + id);
  };
  vm.runInNewContext(compiled, { module, exports, require: requireMock, Date, Promise });
  return { ...module.exports, calls };
}

const params = { params: Promise.resolve({ token: "trainer-token" }) };

for (const [label, expiry] of [
  ["past", new Date(Date.now() - 60_000).toISOString()],
  ["malformed", "not-a-date"],
  ["blank", ""],
  ["whitespace", "   "],
  ["numeric corruption", "999999999999999999"],
  ["permissive numeric year", "9999"],
  ["impossible calendar day", "2030-02-30T00:00:00Z"],
  ["timezone omitted", "2030-01-01T00:00:00"],
]) {
  test("trainer followup denies " + label + " expiry before reading private session data", async () => {
    const portal = makeTrainerPortal(expiry);
    for (const verb of ["GET", "POST", "PATCH"]) {
      const response = await portal[verb]({ json: async () => ({}) }, params);
      assert.equal(response.status, 410);
    }
    assert.deepEqual(portal.calls.map((call) => call.table), [
      "daily_portal_access_tokens", "daily_portal_access_tokens", "daily_portal_access_tokens",
    ]);
  });
}

for (const [label, expiry] of [
  ["future", new Date(Date.now() + 60 * 60_000).toISOString()],
  ["legacy null", null],
]) {
  test("trainer followup accepts " + label + " expiry and scopes GET by organisation", async () => {
    const portal = makeTrainerPortal(expiry);
    const response = await portal.GET({}, params);
    assert.equal(response.status, 200);
    assert.equal(response.body.entries.length, 1);
    const query = portal.calls.find((call) => call.table === "daily_session_followup_entries");
    assert.ok(query, "followup entries must be queried");
    assert.ok(query.clauses.some(([field, value]) => field === "organisation_id" && value === "of-1"));
    assert.ok(query.clauses.some(([field, value]) => field === "session_id" && value === "session-1"));
  });
}

test("trainer followup refuses other roles before session data is read", async () => {
  const portal = makeTrainerPortal(null, { role: "learner" });
  const response = await portal.GET({}, params);
  assert.equal(response.status, 403);
  assert.deepEqual(portal.calls.map((call) => call.table), ["daily_portal_access_tokens"]);
});
