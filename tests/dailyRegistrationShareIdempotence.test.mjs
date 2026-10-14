import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../app/api/client/daily/registration-share/route.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/api/client/daily/action-center/route.ts", import.meta.url), "utf8");

function fixture({ status = "to_attach", tenant = "of-a", enabled = true, token = "abc" } = {}) {
  const row = { id: "f1", organisation_id: tenant, status: "validated", public_registration_enabled: enabled,
    public_registration_token: token, spontaneous_registration_task_status: status };
  const writes = [];
  const admin = { from(table) {
    assert.equal(table, "daily_formations");
    let operation = "read", payload = null;
    const filters = [];
    const matches = () => filters.every(([kind, field, value]) =>
      kind === "eq" ? row[field] === value : kind === "in" ? value.includes(row[field]) :
      kind === "notNull" ? row[field] != null : false);
    return {
      update(value) { operation = "update"; payload = value; return this; },
      select() { return this; },
      eq(field, value) { filters.push(["eq", field, value]); return this; },
      in(field, values) { filters.push(["in", field, values]); return this; },
      not(field, op, value) { assert.equal(op, "is"); assert.equal(value, null); filters.push(["notNull", field]); return this; },
      async maybeSingle() {
        if (!matches()) return { data: null, error: null };
        if (operation === "update") { Object.assign(row, payload); writes.push(payload); }
        return { data: { ...row }, error: null };
      },
    };
  } };
  const context = { ok: true, organisationId: "of-a", user: { id: "user-1" }, admin };
  const exports = {};
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = {
    "next/server": require("next/server"),
    "@/lib/server/agentAssistance": {
      getAssistanceTokenFromRequest: req => req.headers.get("x-assistance-token"),
      blockedAgentAssistanceResponse: () => require("next/server").NextResponse.json({ error: "assistance interdite" }, { status: 403 }),
    },
    "@/lib/server/dailyOrganisationContext": {
      getDailyOrganisationContext: async () => context,
      getDailyOrganisationReadContext: async () => context,
    },
  };
  new Function("require", "exports", js)((name) => {
    assert.ok(Object.hasOwn(deps, name), "Unexpected import: " + name);
    return deps[name];
  }, exports);
  return { row, writes,
    call(body = { id: "f1", status: "attached" }, headers = {}) {
      return exports.PATCH(new Request("https://test.invalid/api/client/daily/registration-share", {
        method: "PATCH", headers, body: JSON.stringify(body),
      }));
    },
  };
}

test("confirmation durable et idempotente", async () => {
  const f = fixture();
  assert.equal((await f.call()).status, 200);
  assert.equal(f.row.spontaneous_registration_task_status, "attached");
  const firstUpdated = f.row.updated_at;
  assert.equal((await f.call()).status, 200);
  assert.equal(f.row.updated_at, firstUpdated);
  assert.equal(f.writes.length, 1);
});

test("statut none autorisé sans ouvrir une tâche", async () => {
  const f = fixture({ status: "none" });
  assert.equal((await f.call()).status, 200);
  assert.equal(f.row.spontaneous_registration_task_status, "attached");
});

test("isolation organisme, lien inactif, archive et assistance", async () => {
  for (const options of [{ tenant: "of-b" }, { enabled: false }, { token: null }, { status: "archived" }]) {
    const f = fixture(options);
    assert.equal((await f.call()).status, 409);
    assert.equal(f.writes.length, 0);
  }
  const f = fixture();
  assert.equal((await f.call(undefined, { "x-assistance-token": "forbidden" })).status, 403);
  assert.equal(f.writes.length, 0);
});

test("impossible de rouvrir une diffusion par PATCH", async () => {
  const f = fixture();
  assert.equal((await f.call({ id: "f1", status: "to_attach" })).status, 400);
  assert.equal((await f.call({ id: "f1", status: "invalid" })).status, 400);
  assert.equal(f.writes.length, 0);
});

test("dashboard filtre déjà les tâches de diffusion accomplies", () => {
  assert.match(dashboard, /\.eq\("spontaneous_registration_task_status","to_attach"\)/);
});
