import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const shareRoute = await readFile(new URL("../app/api/client/daily/registration-share/route.ts", import.meta.url), "utf8");
const sharePage = await readFile(new URL("../app/client/daily/liens-inscription/page.tsx", import.meta.url), "utf8");
const candidaturesPage = await readFile(new URL("../app/client/daily/candidatures/page.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/api/client/daily/action-center/route.ts", import.meta.url), "utf8");

function fixture({ status = "to_attach", tenant = "of-a", enabled = true, token = "abc" } = {}) {
  const row = { id: "f1", organisation_id: tenant, status: "validated", public_registration_enabled: enabled,
    public_registration_token: token, spontaneous_registration_task_status: status, updated_at: "2026-10-01T08:00:00.000Z" };
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
        if (operation === "update") { Object.assign(row, payload); writes.push(structuredClone(payload)); }
        return { data: { ...row }, error: null };
      },
    };
  } };
  const context = { ok: true, organisationId: "of-a", user: { id: "user-1" }, admin };
  const exports = {};
  const js = ts.transpileModule(shareRoute, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
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

test("diffusion : confirmation durable, idempotente et horodatage initial conservé", async () => {
  const f = fixture();
  assert.equal((await f.call()).status, 200);
  assert.equal(f.row.spontaneous_registration_task_status, "attached");
  const firstUpdated = f.row.updated_at;
  assert.notEqual(firstUpdated, "2026-10-01T08:00:00.000Z");
  assert.equal((await f.call()).status, 200);
  assert.equal(f.row.updated_at, firstUpdated);
  assert.equal(f.writes.length, 1);
});

test("diffusion : impossible de rouvrir, de confirmer un lien invalide ou d'écrire en assistance", async () => {
  for (const options of [{ tenant: "of-b" }, { enabled: false }, { token: null }, { status: "archived" }]) {
    const f = fixture(options);
    assert.equal((await f.call()).status, 409);
    assert.equal(f.writes.length, 0);
  }
  const invalid = fixture();
  assert.equal((await invalid.call({ id: "f1", status: "to_attach" })).status, 400);
  assert.equal(invalid.writes.length, 0);
  const assisted = fixture();
  assert.equal((await assisted.call(undefined, { "x-assistance-token": "forbidden" })).status, 403);
  assert.equal(assisted.writes.length, 0);
});

test("diffusion : l'interface ferme toujours son état occupé et le tableau masque les tâches terminées", () => {
  assert.match(sharePage, /finally\s*\{\s*setSavingId\(""\)/);
  assert.match(sharePage, /L'action disparaît de votre tableau de bord/);
  assert.match(dashboard, /\.eq\("spontaneous_registration_task_status","to_attach"\)/);
});

test("candidatures : un clic sans session explique le blocage et une annulation est visible", () => {
  assert.match(candidaturesPage, /Sélectionnez une session avant de créer l’inscription/);
  assert.match(candidaturesPage, /Décision annulée, aucune candidature modifiée/);
  assert.doesNotMatch(candidaturesPage, /disabled=\{!request\.can_decide \|\| busyId === request\.id \|\| !\(selectedSessions\[request\.id\]/);
});
