import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const routePath = "app/api/client/daily/trainer-records/route.ts";
const orgId = "of-1";
const trainerId = "trainer-1";
const pdf = new File(["%PDF-1.4\n"], "contrat.pdf", { type: "application/pdf" });

function fixture({ trainerError = false, trainerMissing = false, versionError = false, supersedeError = false, insertError = false, restoreError = false, current = { id: "doc-current", version: 3, is_current: true }, latest = { id: "doc-latest", version: 4, is_current: false }, forbidden = false } = {}) {
  const calls = [];
  const writes = [];
  const storage = { from(bucket) {
    assert.equal(bucket, "documents");
    return {
      async upload(path) { writes.push(["upload", path]); return { error: null }; },
      async remove(paths) { writes.push(["remove", paths]); return { error: null }; },
    };
  } };
  const admin = {
    storage,
    from(table) {
      const filters = [];
      calls.push({ table, filters });
      let operation = "read";
      let patch;
      return {
        select() { return this; },
        eq(field, value) { filters.push([field, value]); return this; },
        order() { return this; },
        limit() {
          const isCurrent = filters.some(([key, value]) => key === "is_current" && value === true);
          return Promise.resolve({ data: isCurrent ? (current ? [current] : []) : (latest ? [latest] : []), error: versionError ? { message: "private database detail" } : null });
        },
        maybeSingle() { return Promise.resolve({ data: trainerMissing ? null : { id: trainerId }, error: trainerError ? { message: "private database detail" } : null }); },
        update(data) { operation = "update"; patch = data; writes.push(["update", data, filters]); return this; },
        insert(data) { operation = "insert"; writes.push(["insert", data]); return this; },
        single() { return Promise.resolve({ data: insertError ? null : { id: "new-doc", version: 5 }, error: insertError ? { message: "private database detail" } : null }); },
        then(resolve, reject) {
          if (operation !== "update") throw new Error("Unexpected await on query");
          const isRestore = patch.is_current === true;
          return Promise.resolve({ error: isRestore ? (restoreError ? { message: "private database detail" } : null) : (supersedeError ? { message: "private database detail" } : null) }).then(resolve, reject);
        },
      };
    },
  };
  const context = forbidden ? { ok: false, status: 403, error: "Accès refusé." } : {
    ok: true, user: { id: "user-1" }, workspace: { capabilities: { trainers: true, trainers_all: false }, membership: { organisation_id: orgId } },
  };
  const route = loadTypeScript(routePath, {
    "node:crypto": { createHash },
    "next/server": { NextResponse: { json: (body, options = {}) => ({ status: options.status ?? 200, body }) } },
    "@/lib/server/dailyClientWorkspace": { getDailyClientWorkspace: async () => context },
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
  }, { File, Buffer, Date });
  const request = { formData: async () => ({ get: (key) => key === "trainer_id" ? trainerId : key === "file" ? pdf : null }) };
  return { route, request, calls, writes };
}

test("un accès refusé ou une panne de lecture formateur interdit toute lecture et tout upload", async () => {
  for (const [options, status] of [[{ forbidden: true }, 403], [{ trainerError: true }, 500], [{ trainerMissing: true }, 404]]) {
    const f = fixture(options);
    const response = await f.route.POST(f.request);
    assert.equal(response.status, status);
    assert.equal(f.writes.length, 0);
    if (status === 500) assert.doesNotMatch(response.body.error, /private database detail/);
    if (status === 403) assert.equal(f.calls.length, 0);
    else assert.ok(f.calls[0].filters.some(([field, value]) => field === "organisation_id" && value === orgId));
  }
});

test("une panne de lecture des versions interdit l'upload et le remplacement", async () => {
  const f = fixture({ versionError: true });
  assert.equal((await f.route.POST(f.request)).status, 500);
  assert.equal(f.writes.length, 0);
  assert.ok(f.calls.filter(c => c.table === "daily_documents").every(c => c.filters.some(([field, value]) => field === "organisation_id" && value === orgId)));
});

test("un échec de désactivation du contrat courant conserve la version et nettoie l'upload", async () => {
  const f = fixture({ supersedeError: true });
  const response = await f.route.POST(f.request);
  assert.equal(response.status, 500);
  assert.deepEqual(f.writes.map(x => x[0]), ["upload", "update", "remove"]);
  assert.ok(!f.writes.some(x => x[0] === "insert"));
});

test("un échec d'insertion restaure uniquement la version réellement courante", async () => {
  const f = fixture({ insertError: true });
  const response = await f.route.POST(f.request);
  assert.equal(response.status, 500);
  assert.deepEqual(f.writes.map(x => x[0]), ["upload", "update", "insert", "remove", "update"]);
  const updates = f.writes.filter(x => x[0] === "update");
  assert.equal(updates[0][1].is_current, false);
  assert.equal(updates[1][1].is_current, true);
  assert.ok(f.calls.some(c => c.filters.some(([field, value]) => field === "id" && value === "doc-current")));
  assert.ok(!f.calls.some(c => c.filters.some(([field, value]) => field === "id" && value === "doc-latest")));
});

test("une restauration impossible est signalée explicitement", async () => {
  const f = fixture({ insertError: true, restoreError: true });
  const response = await f.route.POST(f.request);
  assert.equal(response.status, 500);
  assert.match(response.body.error, /restauration.*impossible/i);
});

test("le remplacement utilise la dernière version pour le numéro et la version courante pour le lien", async () => {
  const f = fixture();
  const response = await f.route.POST(f.request);
  assert.equal(response.status, 200);
  const insert = f.writes.find(x => x[0] === "insert")[1];
  assert.equal(insert.version, 5);
  assert.equal(insert.previous_document_id, "doc-current");
  assert.equal(insert.organisation_id, orgId);
  assert.equal(insert.linked_object_id, trainerId);
  assert.deepEqual(f.writes.map(x => x[0]), ["upload", "update", "insert"]);
});

test("une version historique non courante ne doit pas être restaurée", async () => {
  const f = fixture({ current: null, insertError: true });
  assert.equal((await f.route.POST(f.request)).status, 500);
  assert.deepEqual(f.writes.map(x => x[0]), ["upload", "insert", "remove"]);
});

test("GET : panne de lecture formateur distincte de fiche introuvable, sans exposition de données", async () => {
  for (const [options, status] of [[{ trainerError: true }, 500], [{ trainerMissing: true }, 404]]) {
    const f = fixture(options);
    const response = await f.route.GET({ url: `https://selen.example.test/?trainer_id=${trainerId}` });
    assert.equal(response.status, status);
    assert.equal(f.calls.length, 1);
    assert.equal(f.writes.length, 0);
  }
});
