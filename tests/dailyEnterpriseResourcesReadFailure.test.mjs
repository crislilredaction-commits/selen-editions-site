import { isValidPortalExpiry } from "../lib/daily/portalAttendanceAccess.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

function setup({ failParticipants = false, participants = [{ email: "learner@alpha.test" }], expiresAt = null } = {}) {
  const reads = [];
  const access = { token: "secret", status: "viewed", portal_type: "enterprise",
    entity_email: "contact@alpha.test", session_id: "session-1", expires_at: expiresAt };
  const company = { name: "Alpha", email: "contact@alpha.test", participants };
  const session = { id: "session-1", organisation_id: "of-1",
    companies: [company], end_date: "2026-10-01" };
  const admin = {
    from(table) {
      const filters = [];
      reads.push({ table, filters });
      const result = () => ({
        data: table === "daily_portal_access_tokens" ? [access]
          : table === "daily_sessions" ? [session] : [],
        error: table === "daily_session_enrolments" && failParticipants
          ? { message: "internal SQL details must not leak" } : null,
      });
      const query = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        neq() { return this; }, is() { return this; }, in() { return this; },
        order() { return this; }, not() { return this; },
        maybeSingle() {
          const value = result();
          return Promise.resolve({ data: value.data[0] ?? null, error: value.error });
        },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return query;
    },
  };
  const { GET } = loadTypeScript("app/api/daily-portal/[token]/resources/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
    "@/lib/daily/portalAttendanceAccess.mjs": { isValidPortalExpiry },
    "@/lib/server/dailyPortalResourceVisibility": {
      DAILY_PORTAL_RESOURCE_STATUSES: ["published"],
      DAILY_PORTAL_RESOURCE_TYPES: ["training_program"],
      isDailyPortalResourceVisible: () => false,
    },
    "@/lib/server/dailyPersonalAttendance": {
      attendanceIsSettled: () => false, isPostsessionDownloadAvailable: () => false,
      personalAttendanceDocumentId: id => "attendance:" + id,
    },
    "@/lib/server/dailyPersonalAssessment": {
      isFinalAssessmentResult: () => false,
      personalAssessmentEvidenceDocumentId: id => "evidence:" + id,
      personalAssessmentResultDocumentId: id => "assessment:" + id,
    },
    "@/lib/server/dailyPortalLearnerIdentity": {
      matchesDailyLearnerPortalAccess: () => false,
      hasUniqueDailyLearnerRecipientEmail: () => false,
    },
    "@/lib/daily/enterprisePortalIdentity.mjs": {
      resolveEnterprisePortalCompany: () => ({ status: "ok", company }),
    },
  }, { Response, Request, Date, Set });
  return {
    get: () => GET(new Request("https://selen.example.test/resources"),
      { params: Promise.resolve({ token: "secret" }) }),
    reads,
  };
}

test("P0 enterprise resources: failed participant lookup returns retryable error, not empty success", async () => {
  const portal = setup({ failParticipants: true });
  const response = await portal.get();
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /temporairement indisponibles/);
  assert.doesNotMatch(body.error, /SQL|internal/);
  const read = portal.reads.find(entry => entry.table === "daily_session_enrolments");
  assert.ok(read, "enterprise participant lookup was attempted");
  assert.deepEqual(read.filters, [["session_id", "session-1"], ["organisation_id", "of-1"]]);
});

test("P0 enterprise resources: a genuinely empty participant lookup is successful", async () => {
  const portal = setup();
  const response = await portal.get();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).documents, []);
  assert.ok(portal.reads.some(entry => entry.table === "daily_session_enrolments"));
});

test("P0 enterprise resources: companies without participant emails need no enrolment lookup", async () => {
  const portal = setup({ participants: [] });
  const response = await portal.get();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).documents, []);
  assert.ok(!portal.reads.some(entry => entry.table === "daily_session_enrolments"));
});


test("P0 enterprise resources: non-ISO future dates cannot expose documents", async () => {
  for (const expiresAt of ["9999", "2030", "2030-02-30T00:00:00Z", "2030-01-01T00:00:00"]) {
    const portal = setup({ expiresAt });
    const response = await portal.get();
    assert.equal(response.status, 410, expiresAt);
    assert.deepEqual(portal.reads.map(({ table }) => table), ["daily_portal_access_tokens"]);
  }
});
