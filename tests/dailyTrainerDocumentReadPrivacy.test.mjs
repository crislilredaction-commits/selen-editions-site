import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const TRAINER = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const DOCUMENT = "44444444-4444-4444-8444-444444444444";
const SQL_SECRET = "SQL PRIVATE INTERNAL organisation_id";
const routes = {
  personal: "app/api/client/daily/trainer-session-workspace/document/route.ts",
  delegated: "app/api/client/daily/assisted-trainer-workspace/document/route.ts",
};
const next = { NextResponse: {
  json(body, init = {}) { return { status: init.status ?? 200, body, headers: init.headers ?? {} }; },
  redirect(url, init = {}) { return { status: 307, url: String(url), headers: init.headers ?? {} }; },
} };

function fixture(mode, options = {}) {
  const queries = [], signed = [], audit = [];
  const admin = {
    from(table) {
      assert.equal(table, "daily_documents");
      const filters = [];
      queries.push(filters);
      return {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        neq(key, value) { filters.push([key, value]); return this; },
        in(key, values) { filters.push([key, values]); return this; },
        async maybeSingle() {
          if (options.sqlThrow) throw new Error(SQL_SECRET);
          if (options.sqlError) return { data: null, error: { message: SQL_SECRET } };
          if (options.noDocument) return { data: null, error: null };
          return { data: {
            id: DOCUMENT, bucket: options.bucket ?? "documents",
            storage_path: options.path ?? `daily/${ORG}/trainer/${TRAINER}/${SESSION}/trainer_resource/resource.pdf`,
          }, error: null };
        },
      };
    },
    storage: { from(bucket) {
      assert.equal(bucket, "documents");
      return { async createSignedUrl(path, duration) {
        signed.push([path, duration]);
        if (options.storageThrow) throw new Error(SQL_SECRET);
        if (options.storageError) return { data: null, error: { message: SQL_SECRET } };
        return { data: { signedUrl: "https://storage.invalid/signed" }, error: null };
      } };
    } },
  };
  const context = mode === "personal"
    ? { ok: true, admin, orgId: ORG, trainerId: TRAINER, user: { id: "user-a" } }
    : { ok: true, admin, organisationId: ORG, assisted: true, assistance: { id: "assistance-a" } };
  const dependencies = {
    "next/server": next,
    "@/lib/server/dailyTrainerWorkspaceContext": {
      getDailyTrainerWorkspaceContext: async () => options.unauthorized ? { ok: false, status: 403, error: "Accès refusé" } : context,
      getAssignedDailyTrainerSession: async () => {
        if (options.assignmentThrow) throw new Error(SQL_SECRET);
        return options.unassigned ? null : { id: SESSION };
      },
    },
    "@/lib/server/dailyOrganisationContext": {
      getDailyOrganisationReadContext: async () => options.unauthorized ? { ok: false, status: 403, error: "Accès refusé" } : context,
    },
    "@/lib/server/dailyAssistedTrainerWorkspace": {
      readDailyAssistedTrainerSession: async () => {
        if (options.assignmentThrow) throw new Error(SQL_SECRET);
        return options.unassigned ? null : { id: SESSION, documents: options.unlisted ? [] : [{ id: DOCUMENT }] };
      },
    },
    "@/lib/server/agentAssistance": { logAgentAssistanceAction: async info => {
      audit.push(info);
      if (options.auditThrow) throw new Error(SQL_SECRET);
    } },
  };
  const api = loadTypeScript(routes[mode], dependencies);
  const url = new URL("https://daily.invalid/api/document");
  url.searchParams.set("session_id", SESSION);
  url.searchParams.set("id", DOCUMENT);
  if (mode === "delegated") url.searchParams.set("trainer_id", TRAINER);
  return { get: (overrides = {}) => {
    for (const [key, value] of Object.entries(overrides)) url.searchParams.set(key, value);
    return api.GET({ url: url.toString() });
  }, queries, signed, audit };
}

for (const mode of ["personal", "delegated"]) {
  test(`P0-08 ${mode} : accès autorisé, scope OF, preuve de délégation et URL privée de 120 secondes`, async () => {
    const f = fixture(mode);
    const r = await f.get();
    assert.equal(r.status, 307);
    assert.equal(r.headers["Cache-Control"], "private, no-store");
    assert.equal(r.headers["X-Content-Type-Options"], "nosniff");
    assert.deepEqual(f.signed.map(([, duration]) => duration), [120]);
    assert.ok(f.queries[0].some(([key, value]) => key === "organisation_id" && value === ORG));
    assert.ok(f.queries[0].some(([key, value]) => key === "session_id" && value === SESSION));
    assert.ok(f.queries[0].some(([key, value]) => key === "is_current" && value === true));
    assert.equal(f.audit.length, mode === "delegated" ? 1 : 0);
  });

  test(`P0-08 ${mode} : identité refusée, affectation retirée et paramètres invalides n'exposent rien`, async () => {
    for (const options of [{ unauthorized: true }, { unassigned: true }, { assignmentThrow: true }]) {
      const f = fixture(mode, options);
      const r = await f.get();
      assert.ok([403, 404, 503].includes(r.status));
      assert.equal(r.headers["Cache-Control"], "private, no-store");
      assert.equal(f.queries.length, 0);
      assert.equal(f.signed.length, 0);
      assert.doesNotMatch(JSON.stringify(r.body), /SQL PRIVATE/);
    }
    const invalid = fixture(mode);
    const r = await invalid.get({ session_id: "not-a-uuid" });
    assert.equal(r.status, 400);
    assert.equal(invalid.queries.length, 0);
  });

  test(`P0-08 ${mode} : document absent, hors stockage OF ou bucket étranger jamais signé`, async () => {
    for (const options of [
      { noDocument: true }, { bucket: "public" }, { path: "daily/other-org/secret.pdf" },
      ...(mode === "delegated" ? [{ unlisted: true }] : []),
    ]) {
      const f = fixture(mode, options);
      const r = await f.get();
      assert.equal(r.status, 404);
      assert.equal(r.headers["Cache-Control"], "private, no-store");
      assert.equal(f.signed.length, 0);
    }
  });

  test(`P0-08 ${mode} : panne SQL/Storage ne révèle aucun détail et ne livre aucun lien`, async () => {
    for (const options of [
      { sqlError: true }, { sqlThrow: true }, { storageError: true }, { storageThrow: true },
      ...(mode === "delegated" ? [{ auditThrow: true }] : []),
    ]) {
      const f = fixture(mode, options);
      const r = await f.get();
      assert.equal(r.status, 503);
      assert.equal(r.headers["Cache-Control"], "private, no-store");
      assert.doesNotMatch(JSON.stringify(r.body), /SQL PRIVATE|organisation_id/);
      assert.equal(r.url, undefined);
    }
  });
}


function workspaceFixture(options = {}) {
  const queries = [];
  const admin = {
    from(table) {
      const filters = [];
      queries.push({ table, filters });
      const query = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        neq() { return this; },
        not() { return this; },
        in() { return this; },
        order() { return this; },
        then(resolve, reject) {
          const signatureRead = table === "daily_documents" && filters.some(([key, value]) => key === "document_type" && value === "trainer_signature_evidence");
          const error = options.sqlError && table === "daily_attendance_slots" || options.signatureError && signatureRead
            ? { message: SQL_SECRET } : null;
          return Promise.resolve({ data: error ? null : [], error }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const context = { ok: true, admin, orgId: ORG, trainerId: TRAINER, trainerName: "Formateur", user: { id: "user-a" } };
  const api = loadTypeScript("app/api/client/daily/trainer-session-workspace/route.ts", {
    "next/server": next,
    "@/lib/server/dailyTrainerPersonalSignature": { recordDailyTrainerPersonalSignature() {} },
    "@/lib/server/dailyEndEvaluationLifecycle": { refreshDailyEndEvaluationsChecklist() {}, tryEnsureDailyPosttrainingDocuments() {} },
    "@/lib/server/dailyAttendanceChecklist": { refreshDailyAttendanceChecklist() {} },
    "@/lib/server/dailyEndEvaluations": { activeDailyEnrolment: () => true },
    "@/lib/server/dailyTrainerWorkspaceContext": {
      getDailyTrainerWorkspaceContext: async () => options.unauthorized ? { ok: false, status: 403, error: "Accès refusé" } : context,
      getAssignedDailyTrainerSession: async () => options.unassigned ? null : { id: SESSION, trainer_ids: [TRAINER] },
    },
  });
  return { get: () => api.GET({ url: "https://daily.invalid/api/client/daily/trainer-session-workspace?session_id=" + SESSION }), queries };
}

test("P0-08 espace formateur : liste privée, bornée à l'OF et à la session", async () => {
  const f = workspaceFixture();
  const r = await f.get();
  assert.equal(r.status, 200);
  assert.equal(r.headers["Cache-Control"], "private, no-store");
  assert.equal(f.queries.length, 5);
  for (const q of f.queries) {
    assert.ok(q.filters.some(([key, value]) => key === "organisation_id" && value === ORG));
    assert.ok(q.filters.some(([key, value]) => key === "session_id" && value === SESSION));
  }
});

test("P0-08 espace formateur : panne SQL ou signature non divulguée, aucun résultat partiel", async () => {
  for (const options of [{ sqlError: true }, { signatureError: true }]) {
    const f = workspaceFixture(options);
    const r = await f.get();
    assert.equal(r.status, 503);
    assert.equal(r.headers["Cache-Control"], "private, no-store");
    assert.doesNotMatch(JSON.stringify(r.body), /SQL PRIVATE|organisation_id/);
    assert.equal(r.body.session, undefined);
  }
  for (const options of [{ unauthorized: true }, { unassigned: true }]) {
    const f = workspaceFixture(options);
    const r = await f.get();
    assert.equal(r.status, options.unauthorized ? 403 : 404);
    assert.equal(f.queries.length, 0);
    assert.equal(r.headers["Cache-Control"], "private, no-store");
  }
});
