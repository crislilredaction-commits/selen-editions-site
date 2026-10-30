import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isActivePortalAttendanceToken } from "../lib/daily/portalAttendanceAccess.mjs";

const source = fs.readFileSync("app/api/daily-portal/[token]/satisfaction/route.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup(status, role = "trainer", expiresAt = null) {
  const reads = [];
  const access = {
    id: "token-1", session_id: "session-1", user_id: "owner-1",
    portal_type: role, entity_key: "recipient-1", entity_name: "Example",
    entity_email: "recipient@example.test", status, expires_at: expiresAt,
  };
  const session = {
    id: "session-1", organisation_id: "of-1", internal_reference: "SESSION-1",
    end_date: "2020-01-01", status: "completed",
    daily_formations: { title: "Formation test" },
  };
  const admin = {
    from(table) {
      reads.push(table);
      const query = {
        select() { return this; },
        eq() { return this; },
        neq() { return this; },
        in() { return this; },
        insert() { return this; },
        update() { return this; },
        maybeSingle() {
          return Promise.resolve({
            data: table === "daily_portal_access_tokens" ? access
              : table === "daily_sessions" ? session : null,
            error: null,
          });
        },
        single() {
          return Promise.resolve({
            data: { id: "response-1", submitted_at: "2026-10-29T12:00:00Z" },
            error: null,
          });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const exports = {};
  const module = { exports };
  const NextResponse = { json: (body, options = {}) => ({
    status: options.status ?? 200, body,
  }) };
  const requireMock = (id) => {
    if (id === "next/server") return { NextResponse };
    if (id === "@/lib/server/clientNdaAccess") return { getAdminSupabase: () => admin };
    if (id === "@/lib/daily/portalAttendanceAccess.mjs") return { isActivePortalAttendanceToken };
    throw new Error("Unexpected import: " + id);
  };
  vm.runInNewContext(compiled, { module, exports, require: requireMock, Date, Intl });
  const args = { params: Promise.resolve({ token: "token-secret" }) };
  const get = () => module.exports.GET(new Request("https://selen.example.test/satisfaction"), args);
  const post = () => module.exports.POST(new Request("https://selen.example.test/satisfaction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ overall_rating: 5 }),
  }), args);
  return { reads, get, post };
}

for (const role of ["trainer", "enterprise"]) {
  for (const method of ["get", "post"]) {
    test(`P0 ${role} satisfaction ${method}: inactive and unknown token states fail closed before session read`, async () => {
      for (const status of ["revoked", "expired", "suspended", "used", "unknown", "", null, undefined]) {
        const portal = setup(status, role);
        const response = await portal[method]();
        assert.equal(response.status, 403, `${role}/${method}/${String(status)}`);
        assert.deepEqual(portal.reads, ["daily_portal_access_tokens"]);
      }
    });
    test(`P0 ${role} satisfaction ${method}: pending and viewed tokens remain valid`, async () => {
      for (const status of ["pending", "viewed"]) {
        const portal = setup(status, role);
        const response = await portal[method]();
        assert.equal(response.status, method === "get" ? 200 : 201);
        assert.ok(portal.reads.includes("daily_sessions"));
      }
    });
    test(`P0 ${role} satisfaction ${method}: expired date denies even an active token`, async () => {
      const portal = setup("viewed", role, "2020-01-01T00:00:00Z");
      const response = await portal[method]();
      assert.equal(response.status, 410);
      assert.deepEqual(portal.reads, ["daily_portal_access_tokens"]);
    });
  }
}

for (const role of ["trainer", "enterprise"]) {
  for (const method of ["get", "post"]) {
    for (const [label, expiresAt] of [
      ["malformed", "not-a-date"],
      ["empty", ""],
      ["whitespace", "   "],
      ["numeric", 1234],
      ["NaN", Number.NaN],
    ]) {
      test(`P0 ${role} satisfaction ${method}: ${label} expiry denies before session read`, async () => {
        const portal = setup("viewed", role, expiresAt);
        const response = await portal[method]();
        assert.equal(response.status, 410);
        assert.deepEqual(portal.reads, ["daily_portal_access_tokens"]);
      });
    }
    test(`P0 ${role} satisfaction ${method}: valid future deadline stays accessible`, async () => {
      const portal = setup("pending", role, "2099-01-01T00:00:00.000Z");
      const response = await portal[method]();
      assert.equal(response.status, method === "get" ? 200 : 201);
      assert.ok(portal.reads.includes("daily_sessions"));
    });
  }
}
