import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const orgId = "of-a";
const trainerId = "trainer-a";
const sessionId = "session-a";
const response = { NextResponse: { json: (body, options = {}) => ({ status: options.status ?? 200, body }) } };

function makeContext(admin) {
  return { ok: true, admin, orgId, trainerId, trainerName: "Formateur", user: { id: "user-a" } };
}

test("affectation formateur : panne SQL distincte d'une session absente et périmètre OF", async () => {
  for (const [data, error, expected] of [
    [null, { message: "internal database secret" }, "error"],
    [null, null, "missing"],
    [{ id: sessionId, trainer_ids: ["trainer-b"] }, null, "foreign"],
    [{ id: sessionId, trainer_ids: [trainerId] }, null, "assigned"],
  ]) {
    const filters = [];
    const admin = { from(table) {
      assert.equal(table, "daily_sessions");
      return {
        select() { return this; },
        eq(field, value) { filters.push([field, value]); return this; },
        async maybeSingle() { return { data, error }; },
      };
    } };
    const helper = loadTypeScript("lib/server/dailyTrainerWorkspaceContext.ts", {
      "@/lib/server/dailyClientWorkspace": { getDailyClientWorkspace: async () => ({ ok: false }) },
      "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
    });
    const context = makeContext(admin);
    if (expected === "error") {
      await assert.rejects(helper.getAssignedDailyTrainerSession(context, sessionId), /Impossible de vérifier l’affectation/);
    } else {
      const found = await helper.getAssignedDailyTrainerSession(context, sessionId);
      assert.equal(found?.id ?? null, expected === "assigned" ? sessionId : null);
    }
    assert.ok(filters.some(([key, value]) => key === "organisation_id" && value === orgId));
    assert.ok(filters.some(([key, value]) => key === "id" && value === sessionId));
  }
});

function makeRoute(path, assigned) {
  let accesses = 0;
  const admin = { from() { accesses++; throw new Error("Must not read after session guard"); } };
  const context = makeContext(admin);
  const sessionLookup = async () => {
    if (assigned === "error") throw new Error("internal database secret");
    return assigned === "missing" ? null : { id: sessionId, trainer_ids: [trainerId] };
  };
  const deps = {
    "next/server": response,
    "@/lib/server/dailyTrainerWorkspaceContext": {
      getDailyTrainerWorkspaceContext: async () => context,
      getAssignedDailyTrainerSession: sessionLookup,
    },
  };
  if (path.includes("attendance-sheet")) {
    return { module: loadTypeScript(path, deps), get accesses() { return accesses; } };
  }
  Object.assign(deps, {
    "@/lib/server/dailyTrainerPersonalSignature": { recordDailyTrainerPersonalSignature() { throw new Error("No signature permitted"); } },
    "@/lib/server/dailyEndEvaluationLifecycle": { refreshDailyEndEvaluationsChecklist() {}, tryEnsureDailyPosttrainingDocuments() {} },
    "@/lib/server/dailyAttendanceChecklist": { refreshDailyAttendanceChecklist() {} },
    "@/lib/server/dailyEndEvaluations": { activeDailyEnrolment: () => true },
  });
  return { module: loadTypeScript(path, deps), get accesses() { return accesses; } };
}

const workspacePath = "app/api/client/daily/trainer-session-workspace/route.ts";
const sheetPath = "app/api/client/daily/trainer-session-workspace/attendance-sheet/route.ts";

test("espace formateur GET/POST et feuille : panne d'affectation = 500 sans accès métier", async () => {
  for (const [path, verb] of [[workspacePath, "GET"], [workspacePath, "POST"], [sheetPath, "GET"]]) {
    const route = makeRoute(path, "error");
    const req = verb === "GET"
      ? { url: "https://example.test/?session_id=" + sessionId }
      : { formData: async () => ({ get: key => key === "session_id" ? sessionId : key === "kind" ? "resource" : null }) };
    const result = await route.module[verb](req);
    assert.equal(result.status, 500, path + " " + verb);
    assert.match(result.body.error, /Impossible de vérifier l’affectation/);
    assert.doesNotMatch(result.body.error, /internal database secret/);
    assert.equal(route.accesses, 0);
  }
});

test("espace formateur GET/POST et feuille : session étrangère = 404, sans accès métier", async () => {
  for (const [path, verb] of [[workspacePath, "GET"], [workspacePath, "POST"], [sheetPath, "GET"]]) {
    const route = makeRoute(path, "missing");
    const req = verb === "GET"
      ? { url: "https://example.test/?session_id=" + sessionId }
      : { formData: async () => ({ get: key => key === "session_id" ? sessionId : key === "kind" ? "resource" : null }) };
    assert.equal((await route.module[verb](req)).status, 404);
    assert.equal(route.accesses, 0);
  }
});

test("espace formateur GET/POST : session manquante = 400 avant requête", async () => {
  for (const verb of ["GET", "POST"]) {
    const route = makeRoute(workspacePath, "error");
    const req = verb === "GET"
      ? { url: "https://example.test/" }
      : { formData: async () => ({ get: () => null }) };
    assert.equal((await route.module[verb](req)).status, 400);
    assert.equal(route.accesses, 0);
  }
});
