import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const pathGuard = loadTypeScript("lib/server/dailyPersonalAttendance.ts");
function setup(storagePath) {
  const enrolment = { id: "enrolment", organisation_id: "org", session_id: "session", learner_id: "learner", status: "active", daily_learners: { email: "learner@example.test" } };
  const rows = {
    daily_portal_access_tokens: [{ token: "secret", session_id: "session", portal_type: "learner", entity_key: "learner:learner", entity_email: "learner@example.test", status: "pending", expires_at: null }],
    daily_sessions: [{ id: "session", organisation_id: "org", status: "completed", end_date: "2026-10-01" }],
    daily_documents: [{ id: "doc", organisation_id: "org", session_id: "session", enrolment_id: "enrolment", learner_id: "learner", linked_object_type: "enrolment", linked_object_id: "enrolment", document_type: "learning_assessment_evidence", bucket: "documents", storage_path: storagePath, logical_name: "result.pdf", is_current: true, archived_at: null }],
    daily_session_enrolments: [enrolment],
    daily_learning_assessments: [{ organisation_id: "org", session_id: "session", enrolment_id: "enrolment", outcome: "validated", assessed_at: "2026-10-02" }],
  };
  const signed = [];
  const admin = {
    from(table) {
      const filters = []; let single = false;
      const q = {
        select() { return q; },
        eq(k,v) { filters.push(row => row[k] === v); return q; },
        neq(k,v) { filters.push(row => row[k] !== v); return q; },
        is(k,v) { filters.push(row => row[k] === v); return q; },
        not() { return q; },
        maybeSingle() { single = true; return q; },
        then(ok,fail) { return Promise.resolve().then(() => {
          const matches = (rows[table] ?? []).filter(row => filters.every(f => f(row)));
          return { data: single ? matches[0] ?? null : matches, error: null };
        }).then(ok,fail); },
      }; return q;
    },
    storage: { from(bucket) {
      assert.equal(bucket, "documents");
      return { async createSignedUrl(path, ttl) {
        signed.push(path); assert.equal(ttl, 120);
        return { data: { signedUrl: "https://files.example.test/result.pdf" }, error: null };
      } };
    } },
  };
  const { GET } = loadTypeScript("app/api/daily-portal/[token]/personal-assessment-evidence/route.ts", {
    "next/server": { NextResponse: { json: (body,init) => Response.json(body,init), redirect: (url,init) => new Response(null,{status:302,headers:{location:String(url),...(init?.headers??{})}}) } },
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
    "@/lib/server/dailyPersonalAttendance": { isPostsessionDownloadAvailable: () => true, personalSignatureStorageObjectPath: pathGuard.personalSignatureStorageObjectPath },
    "@/lib/server/dailyPersonalAssessment": { isFinalAssessmentResult: () => true },
    "@/lib/server/dailyPortalLearnerIdentity": { matchesDailyLearnerPortalAccess: () => true, findUniqueDailyLearnerPortalEnrolment: (_access, list) => list[0] },
  }, { Response });
  return { get: () => GET(new Request("https://selen.example.test/api/daily-portal/secret/personal-assessment-evidence?document=doc"), { params: Promise.resolve({ token: "secret" }) }), signed };
}
test("final assessment evidence signs only a valid OF-owned object", async () => {
  const h = setup("daily/org/evidence.pdf");
  const response = await h.get();
  assert.equal(response.status, 302);
  assert.deepEqual(h.signed, ["daily/org/evidence.pdf"]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
for (const storagePath of ["daily/other/evidence.pdf", "daily/org/../evidence.pdf", "daily/org/./evidence.pdf", "daily/org//evidence.pdf", "daily/org\\evidence.pdf"]) {
  test("final assessment evidence rejects unsafe Storage path: " + storagePath, async () => {
    const h = setup(storagePath);
    assert.equal((await h.get()).status, 404);
    assert.deepEqual(h.signed, []);
  });
}
