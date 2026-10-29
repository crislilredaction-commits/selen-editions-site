import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";
import { isActivePortalAttendanceToken } from "../lib/daily/portalAttendanceAccess.mjs";

const routes = ["personal-attendance", "personal-assessment-result", "personal-assessment-evidence"];

function setup(route, { expiresAt = null, status = "pending", portalType = "learner" } = {}) {
  const reads = [];
  let signed = 0;
  const access = {
    session_id: "session", portal_type: portalType, entity_key: "learner:one",
    entity_name: "Test", entity_email: "learner@example.invalid",
    status, expires_at: expiresAt,
  };
  const admin = {
    from(table) {
      reads.push(table);
      const query = {
        select() { return query; },
        eq() { return query; },
        neq() { return query; },
        not() { return query; },
        in() { return query; },
        is() { return query; },
        order() { return query; },
        maybeSingle() {
          return Promise.resolve({
            data: table === "daily_portal_access_tokens" ? access : null,
            error: null,
          });
        },
      };
      return query;
    },
    storage: {
      from() {
        return {
          createSignedUrl() { signed++; throw new Error("Storage must not be reached"); },
          download() { signed++; throw new Error("Storage must not be reached"); },
        };
      },
    },
  };
  const { GET } = loadTypeScript("app/api/daily-portal/[token]/" + route + "/route.ts", {
    "next/server": {
      NextResponse: {
        json: (body, init) => Response.json(body, init),
        redirect: (url, init) => new Response(null, { status: 302, headers: { location: String(url), ...(init?.headers ?? {}) } }),
      },
    },
    "jspdf": { jsPDF: class {} },
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
    "@/lib/daily/portalAttendanceAccess.mjs": { isActivePortalAttendanceToken },
    "@/lib/server/dailyPersonalAttendance": {
      isPostsessionDownloadAvailable: () => true,
      safePersonalDownloadName: () => "document.pdf",
      personalSignatureStorageObjectPath: () => null,
      attendanceIsSettled: () => true,
    },
    "@/lib/server/dailyPersonalAssessment": {
      isFinalAssessmentResult: () => true,
      assessmentOutcomeLabel: () => "Validé",
    },
    "@/lib/server/dailyPosttrainingDocumentHtml": { buildPersonalAssessmentResultHtml: () => "<html></html>" },
    "@/lib/server/dailyPortalLearnerIdentity": {
      findUniqueDailyLearnerPortalEnrolment: () => null,
      matchesDailyLearnerPortalAccess: () => false,
    },
  }, { Response, Buffer });
  const url = "https://selen.example.invalid/api/daily-portal/secret/" + route + "?enrolment=enrolment&document=document";
  return {
    get: () => GET(new Request(url), { params: Promise.resolve({ token: "secret" }) }),
    reads,
    signed: () => signed,
  };
}

for (const route of routes) {
  for (const [label, expiresAt] of [
    ["expired", "2000-01-01T00:00:00.000Z"],
    ["equal to current past", "2026-10-01T00:00:00.000Z"],
    ["malformed", "not-a-date"],
    ["empty", ""],
    ["whitespace", " "],
    ["numeric", 1234],
    ["NaN", Number.NaN],
  ]) {
    test(route + ": rejects " + label + " expiry before business reads", async () => {
      const h = setup(route, { expiresAt });
      const response = await h.get();
      assert.equal(response.status, 410);
      assert.deepEqual(h.reads, ["daily_portal_access_tokens"]);
      assert.equal(h.signed(), 0);
    });
  }

  for (const status of ["pending", "viewed"]) {
    for (const expiresAt of [null, "2099-01-01T00:00:00.000Z"]) {
      test(route + ": accepts active " + status + " link with " + String(expiresAt) + " expiry", async () => {
        const h = setup(route, { status, expiresAt });
        const response = await h.get();
        assert.notEqual(response.status, 410);
        assert.ok(h.reads.includes("daily_sessions"));
        assert.equal(h.signed(), 0);
      });
    }
  }

  for (const status of ["revoked", "expired", "suspended", "sent", "unknown", ""]) {
    test(route + ": rejects " + status + " status before business reads", async () => {
      const h = setup(route, { status, expiresAt: "2099-01-01T00:00:00.000Z" });
      const response = await h.get();
      assert.equal(response.status, 403);
      assert.deepEqual(h.reads, ["daily_portal_access_tokens"]);
      assert.equal(h.signed(), 0);
    });
  }

  test(route + ": rejects a non-learner role before business reads", async () => {
    const h = setup(route, { portalType: "enterprise" });
    const response = await h.get();
    assert.equal(response.status, 404);
    assert.deepEqual(h.reads, ["daily_portal_access_tokens"]);
    assert.equal(h.signed(), 0);
  });
}
