import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../app/api/client/daily/trainer-followup/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function makeFollowup({ sessionError = false, assigned = true, enrolmentError = false } = {}) {
  const calls = [];
  const admin = {
    from(table) {
      const clauses = [];
      calls.push({ table, clauses });
      return {
        select() { return this; },
        eq(field, value) { clauses.push([field, value]); return this; },
        maybeSingle() {
          if (table === "daily_sessions") {
            return Promise.resolve({
              data: sessionError ? null : { id: "session-1", trainer_ids: assigned ? ["trainer-1"] : ["another-trainer"] },
              error: sessionError ? { message: "Database unavailable" } : null,
            });
          }
          if (table === "daily_session_enrolments") {
            return Promise.resolve({
              data: enrolmentError ? null : { id: "enrolment-1", status: "active" },
              error: enrolmentError ? { message: "Database unavailable" } : null,
            });
          }
          throw new Error("Unexpected table " + table);
        },
        insert() { throw new Error("No write permitted in this test"); },
      };
    },
  };
  const workspace = {
    ok: true,
    user: { id: "user-1", email: "trainer@example.test" },
    workspace: {
      trainers: [{ id: "trainer-1", user_id: "user-1", display_name: "Formateur" }],
      capabilities: { trainer_self: true },
      membership: { roles: ["trainer"], organisation_id: "of-1" },
    },
  };
  const exports = {};
  const module = { exports };
  const requireMock = (id) => {
    if (id === "next/server") return { NextResponse: { json: (body, init = {}) => ({ status: init.status ?? 200, body }) } };
    if (id === "@/lib/server/dailyClientWorkspace") return { getDailyClientWorkspace: async () => workspace };
    if (id === "@/lib/server/clientNdaAccess") return { getAdminSupabase: () => admin };
    throw new Error("Unexpected dependency " + id);
  };
  vm.runInNewContext(compiled, { module, exports, require: requireMock, URL, Date, Promise });
  return { ...module.exports, calls };
}

const validRequest = {
  json: async () => ({
    action: "create",
    session_id: "session-1",
    enrolment_id: "enrolment-1",
    request_id: "123e4567-e89b-42d3-a456-426614174000",
    summary: "Besoin d'accompagnement",
  }),
};

test("GET et POST signalent une panne de lecture de session en 500, sans la masquer en 404", async () => {
  for (const verb of ["GET", "POST"]) {
    const route = makeFollowup({ sessionError: true });
    const response = await route[verb](verb === "GET"
      ? { url: "https://selen.example.test/api/client/daily/trainer-followup?session_id=session-1" }
      : validRequest);
    assert.equal(response.status, 500, verb);
    assert.match(response.body.error, /Impossible de vérifier l'affectation/);
    assert.deepEqual(route.calls.map(({ table }) => table), ["daily_sessions"]);
    assert.ok(route.calls[0].clauses.some(([key, value]) => key === "organisation_id" && value === "of-1"));
  }
});

test("une session non affectée reste 404 sans divulguer ses données", async () => {
  const route = makeFollowup({ assigned: false });
  const response = await route.GET({
    url: "https://selen.example.test/api/client/daily/trainer-followup?session_id=session-1",
  });
  assert.equal(response.status, 404);
  assert.deepEqual(route.calls.map(({ table }) => table), ["daily_sessions"]);
});

test("une panne de lecture d'inscription bloque l'écriture et retourne 500", async () => {
  const route = makeFollowup({ enrolmentError: true });
  const response = await route.POST(validRequest);
  assert.equal(response.status, 500);
  assert.match(response.body.error, /Impossible de vérifier cette inscription/);
  assert.deepEqual(route.calls.map(({ table }) => table), ["daily_sessions", "daily_session_enrolments"]);
  for (const call of route.calls) {
    assert.ok(call.clauses.some(([key, value]) => key === "organisation_id" && value === "of-1"));
    assert.ok(call.clauses.some(([key, value]) => key === "session_id" && value === "session-1") || call.table === "daily_sessions");
  }
});
