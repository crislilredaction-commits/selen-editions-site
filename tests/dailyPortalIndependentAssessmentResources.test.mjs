import { isValidPortalExpiry } from "../lib/daily/portalAttendanceAccess.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

function setup({ publishedAttendance = false, attendanceStatus = "published", finalAssessment = true, active = true, tokenStatus = "pending", postsession = true, otherOrganisation = false } = {}) {
  const rows = {
    daily_portal_access_tokens: [{ token: "secret", portal_type: "learner", status: tokenStatus, session_id: "session", entity_email: "learner@example.test", expires_at: null }],
    daily_sessions: [{ id: "session", organisation_id: "org", companies: [], end_date: "2026-10-01", status: "completed" }],
    daily_session_enrolments: [{ id: "enrolment", learner_id: "learner", organisation_id: "org", session_id: "session", status: active ? "active" : "cancelled", daily_learners: { email: "learner@example.test" } }],
    daily_documents: publishedAttendance ? [{ id: "attendance", organisation_id: "org", session_id: "session", document_type: "attendance_summary", status: attendanceStatus, is_current: true, archived_at: null }] : [],
    daily_learning_assessments: [{ enrolment_id: "enrolment", organisation_id: otherOrganisation ? "other" : "org", session_id: "session", outcome: finalAssessment ? "achieved" : "pending", assessed_at: finalAssessment ? "2026-10-02T10:00:00Z" : null }],
    daily_attendance_slots: [{ id: "slot", organisation_id: "org", session_id: "session", status: "closed" }],
    daily_attendance_records: [{ slot_id: "slot", enrolment_id: "enrolment", organisation_id: "org", session_id: "session", status: "present" }],
  };
  const reads = [];
  const admin = {
    from(table) {
      reads.push(table);
      const predicates = [];
      const query = {
        select() { return query; },
        eq(k, v) { predicates.push(row => row[k] === v); return query; },
        neq(k, v) { predicates.push(row => row[k] !== v); return query; },
        is(k, v) { predicates.push(row => (row[k] ?? null) === v); return query; },
        in(k, values) { predicates.push(row => values.includes(row[k])); return query; },
        order() { return query; },
        limit() { return query; },
        then(resolve, reject) {
          return Promise.resolve({ data: (rows[table] ?? []).filter(row => predicates.every(fn => fn(row))), error: null }).then(resolve, reject);
        },
        maybeSingle() {
          return Promise.resolve({ data: (rows[table] ?? []).filter(row => predicates.every(fn => fn(row)))[0] ?? null, error: null });
        },
      };
      return query;
    },
  };
  const { GET } = loadTypeScript("app/api/daily-portal/[token]/resources/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
    "@/lib/daily/portalAttendanceAccess.mjs": { isValidPortalExpiry },
    "@/lib/server/dailyPortalResourceVisibility": { DAILY_PORTAL_RESOURCE_STATUSES: ["published"], DAILY_PORTAL_RESOURCE_TYPES: ["training_program"], isDailyPortalResourceVisible: () => false },
    "@/lib/server/dailyPersonalAttendance": { attendanceIsSettled: () => true, isPostsessionDownloadAvailable: () => postsession, personalAttendanceDocumentId: id => "attendance:" + id },
    "@/lib/server/dailyPersonalAssessment": { isFinalAssessmentResult: (outcome, date) => outcome === "achieved" && Boolean(date), personalAssessmentEvidenceDocumentId: id => "evidence:" + id, personalAssessmentResultDocumentId: id => "assessment:" + id },
    "@/lib/server/dailyPortalLearnerIdentity": { matchesDailyLearnerPortalAccess: () => true, hasUniqueDailyLearnerRecipientEmail: () => false },
    "@/lib/daily/enterprisePortalIdentity.mjs": { resolveEnterprisePortalCompany: () => ({ status: "missing" }) },
  }, { Response, Request, Date, Set });
  return { get: () => GET(new Request("https://selen.example.test/resources"), { params: Promise.resolve({ token: "secret" }) }), reads };
}

test("a final personal assessment remains visible without a published attendance sheet", async () => {
  const h = setup();
  const response = await h.get();
  assert.equal(response.status, 200);
  const { documents } = await response.json();
  assert.ok(documents.some(doc => doc.id === "assessment:enrolment"));
  assert.ok(!documents.some(doc => doc.document_type === "personal_attendance_summary"));
  assert.ok(!h.reads.includes("daily_attendance_slots"));
});

test("a published attendance sheet is independently listed when slots are settled", async () => {
  const { documents } = await (await setup({ publishedAttendance: true }).get()).json();
  assert.ok(documents.some(doc => doc.id === "assessment:enrolment"));
  assert.ok(documents.some(doc => doc.id === "attendance:enrolment"));
});

test("unfinished assessments remain hidden even when attendance is published", async () => {
  const { documents } = await (await setup({ publishedAttendance: true, finalAssessment: false }).get()).json();
  assert.ok(!documents.some(doc => doc.document_type === "personal_assessment_result"));
  assert.ok(documents.some(doc => doc.document_type === "personal_attendance_summary"));
});

test("assessment resources remain scoped to the current OF", async () => {
  const { documents } = await (await setup({ otherOrganisation: true }).get()).json();
  assert.ok(!documents.some(doc => doc.document_type === "personal_assessment_result"));
});

test("inactive enrolments, revoked links and unfinished sessions do not expose results", async () => {
  for (const options of [{ active: false }, { tokenStatus: "revoked" }, { postsession: false }]) {
    const response = await setup(options).get();
    if (options.postsession === false) {
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).documents, []);
    } else {
      assert.equal(response.status, 403);
    }
  }
});

test("an unpublished attendance summary never unlocks the personal sheet", async () => {
  const { documents } = await (await setup({ publishedAttendance: true, attendanceStatus: "draft" }).get()).json();
  assert.ok(documents.some(doc => doc.document_type === "personal_assessment_result"));
  assert.ok(!documents.some(doc => doc.document_type === "personal_attendance_summary"));
});
