import { isValidPortalExpiry } from "../lib/daily/portalAttendanceAccess.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync("app/api/daily-portal/[token]/route.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function makePortal(failedTable = null, role = "trainer") {
  const calls = [];
  const access = { id: "token-id", token: "valid", portal_type: role, status: "viewed",
    session_id: "session-1", user_id: "owner-1", entity_key: "learner:learner-1", entity_email: "trainer@example.test" };
  const session = { id: "session-1", organisation_id: "of-1", status: "scheduled", formation_id: "formation-1",
    beneficiaries: [], individual_beneficiaries: [], companies: [], daily_formations: null };
  const admin = {
    from(table) {
      calls.push(table);
      const result = () => ({
        data: table === "daily_portal_access_tokens" ? access
          : table === "daily_sessions" ? session
          : table === "daily_session_enrolments" ? [{ id: "enrol-1", learner_id: "learner-1", status: "active", daily_learners: { id: "learner-1", email: "trainer@example.test" } }]
          : table === "daily_formations" ? { id: "formation-1", organisation_id: "of-1", status: "validated", creation_mode: "selen_form" }
          : [],
        error: table === failedTable ? { message: "database read failed" } : null,
      });
      const query = {
        select() { return this; }, eq() { return this; }, neq() { return this; },
        in() { return this; }, is() { return this; }, order() { return this; },
        maybeSingle() { return Promise.resolve(result()); },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return query;
    },
  };
  const exports = {};
  const module = { exports };
  const NextResponse = { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers ?? {} }) };
  const requireMock = (id) => {
    if (id === "next/server") return { NextResponse };
    if (id === "@/lib/server/clientNdaAccess") return { getAdminSupabase: () => admin };
    if (id === "@/lib/daily/portalAttendanceAccess.mjs") return { isValidPortalExpiry };
    if (id === "@/lib/server/dailyPortalResourceVisibility") return {
      DAILY_PORTAL_RESOURCE_STATUSES: [], isDailyPortalResourceVisible: () => false,
    };
    if (id === "@/lib/server/dailyPersonalAttendance") return { isPostsessionDownloadAvailable: () => false };
    if (id === "@/lib/daily/ownPositioning") return { positioningSourceDocumentId: () => null };
    if (id === "@/lib/server/dailyPortalLearnerIdentity") return {
      matchesDailyLearnerPortalAccess: () => true, hasUniqueDailyLearnerRecipientEmail: () => true,
    };
    if (id === "@/lib/daily/enterprisePortalIdentity.mjs") return {
      resolveEnterprisePortalCompany: () => null, matchesEnterprisePortalRecipient: () => false,
    };
    throw new Error("Unexpected module: " + id);
  };
  vm.runInNewContext(compiled, { module, exports, require: requireMock, Date, URL });
  return { GET: module.exports.GET, calls };
}

for (const table of ["daily_onboarding", "daily_registration_responses", "daily_conventions",
  "daily_trainers", "daily_convocations"]) {
  test("P0 portal: " + table + " failure is not reported as an empty success", async () => {
    const portal = makePortal(table);
    const response = await portal.GET({}, { params: Promise.resolve({ token: "valid" }) });
    assert.equal(response.status, 503);
    assert.match(response.body.error, /temporairement indisponibles/);
    assert.doesNotMatch(response.body.error, /database read failed/);
    assert.ok(!portal.calls.includes("daily_documents"), "no partial document reads after failure");
  });
}

test("P0 portal: a genuinely empty optional result remains a valid portal response", async () => {
  const portal = makePortal();
  const response = await portal.GET({}, { params: Promise.resolve({ token: "valid" }) });
  assert.equal(response.status, 200);
  assert.deepEqual(Array.from(response.body.conventions), []);
  assert.deepEqual(Array.from(response.body.convocations), []);
});

test("P0 portal: all five ancillary reads are guarded before a token is marked viewed", () => {
  const readGuard = source.indexOf("[onboardingR,responsesR,conventionsR,trainersR,convocationsR].some");
  const viewedWrite = source.indexOf('if(access.status==="pending")');
  assert.ok(readGuard > source.indexOf("if(enrolmentsR.error)"));
  assert.ok(viewedWrite > readGuard);
});

for (const [table, role] of [
  ["daily_portal_access_tokens", "trainer"],
  ["daily_sessions", "trainer"],
  ["daily_session_enrolments", "trainer"],
  ["daily_documents", "learner"],
  ["daily_formations", "learner"],
]) {
  test("P0 portal: " + table + " read errors are private, retryable and uncached", async () => {
    const portal = makePortal(table, role);
    const response = await portal.GET({}, { params: Promise.resolve({ token: "valid" }) });
    assert.equal(response.status, 503);
    assert.match(response.body.error, /temporairement indisponibles/);
    assert.doesNotMatch(response.body.error, /database read failed/);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
  });
}

test("P0 portal: successful private payload is never cached", async () => {
  const response = await makePortal().GET({}, { params: Promise.resolve({ token: "valid" }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
});

test("P0 portal: source-programme read failure does not leak SQL details", () => {
  assert.match(source, /if\(sourceError\)return portalReadFailure\(\)/);
  assert.doesNotMatch(source, /(?:accessError|sessionR\.error|enrolmentsR\.error|formationError|sourceError)\.message/);
});
