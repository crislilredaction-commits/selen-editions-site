import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const identity = loadTypeScript("lib/server/dailyPortalLearnerIdentity.ts");
const pathGuard = loadTypeScript("lib/server/dailyPersonalAttendance.ts");
const { isActivePortalAttendanceToken } = await import("../lib/daily/portalAttendanceAccess.mjs");
const primary = { learner_id: "learner", session_id: "session", organisation_id: "org", status: "active", daily_learners: { email: "shared@example.test" } };
const cancelled = { learner_id: "other", session_id: "session", organisation_id: "org", status: "cancelled", daily_learners: { email: "shared@example.test" } };

function setup({ status = "pending", entityKey = "learner:learner", enrolments = [primary], mode = "selen_form", sourcePath = "daily/org/program.pdf", sqlError = false, expiresAt = null } = {}) {
  const rows = {
    daily_portal_access_tokens: [{ token: "secret", session_id: "session", portal_type: "learner", entity_key: entityKey, entity_email: "shared@example.test", status, expires_at: expiresAt }],
    daily_sessions: [{ id: "session", organisation_id: "org", formation_id: "formation", user_id: "owner", status: "active" }],
    daily_session_enrolments: enrolments,
    daily_formations: [{ id: "formation", organisation_id: "org", user_id: "owner", title: "Formation", status: "validated", creation_mode: mode, detailed_program_document_url: "source" }],
    daily_documents: [{ id: "source", organisation_id: "org", formation_id: "formation", linked_object_type: "organisation", linked_object_id: "org", document_type: "training_program_source", bucket: "documents", storage_path: sourcePath, is_current: true, archived_at: null, status: "to_check" }],
    daily_onboarding: [{ user_id: "owner", organisation_name: "OF" }],
  };
  const reads = [], signedPaths = [];
  const admin = {
    from(table) {
      reads.push(table);
      const filters = [];
      let single = false;
      const q = {
        select() { return q; },
        eq(k,v) { filters.push(row => row[k] === v); return q; },
        neq(k,v) { filters.push(row => row[k] !== v); return q; },
        maybeSingle() { single = true; return q; },
        then(ok,fail) { return Promise.resolve().then(() => {
          if (sqlError && table === "daily_session_enrolments") return { data: null, error: { message: "SQL unavailable" } };
          const result = rows[table].filter(row => filters.every(f => f(row)));
          return { data: single ? result[0] ?? null : result, error: null };
        }).then(ok,fail); },
      };
      return q;
    },
    storage: { from(bucket) {
      assert.equal(bucket, "documents");
      return { async createSignedUrl(path, ttl) {
        signedPaths.push(path);
        assert.equal(ttl, 120);
        return { data: { signedUrl: "https://files.example.test/program.pdf" }, error: null };
      } };
    } },
  };
  const { GET } = loadTypeScript("app/api/daily-portal/[token]/program-pdf/route.ts", {
    "next/server": { NextResponse: { json: (body,init) => Response.json(body,init), redirect: (url,init) => new Response(null,{ status: 302, headers: { location: String(url), ...(init?.headers ?? {}) } }) } },
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
    "@/lib/server/dailyRegistrationProgramPdf": { renderRegistrationProgramPdf: () => new Uint8Array([37,80,68,70,45]) },
    "@/lib/daily/ownPositioning": { positioningSourceDocumentId: () => "source" },
    "@/lib/server/dailyPortalLearnerIdentity": identity,
    "@/lib/server/dailyPersonalAttendance": pathGuard,
    "@/lib/daily/portalAttendanceAccess.mjs": { isActivePortalAttendanceToken },
  }, { Response, fetch: () => assert.fail("Network forbidden") });
  return { get: () => GET(null, { params: Promise.resolve({ token: "secret" }) }), reads, signedPaths };
}

for (const status of ["revoked", "expired", "disabled", "unknown"]) {
  test("private programme rejects token status " + status, async () => {
    const h = setup({ status }), r = await h.get();
    assert.equal(r.status, 403);
    assert.deepEqual(h.reads, ["daily_portal_access_tokens"]);
  });
}
test("legacy shared email is ambiguous even when the other enrolment is cancelled", async () => {
  const h = setup({ entityKey: "", enrolments: [primary, cancelled] });
  assert.equal((await h.get()).status, 403);
  assert.ok(!h.reads.includes("daily_formations"));
});
test("canonical learner key stays valid when another learner shares the email", async () => {
  const h = setup({ enrolments: [primary, cancelled] });
  assert.equal((await h.get()).status, 200);
});
test("cancelled canonical learner cannot download the programme", async () => {
  const h = setup({ entityKey: "learner:other", enrolments: [primary, cancelled] });
  assert.equal((await h.get()).status, 403);
  assert.ok(!h.reads.includes("daily_formations"));
});
test("SQL error fails closed before programme generation", async () => {
  const h = setup({ sqlError: true });
  assert.equal((await h.get()).status, 500);
  assert.ok(!h.reads.includes("daily_formations"));
});
test("imported programme signs a valid OF-scoped path only", async () => {
  const h = setup({ mode: "program_import" }), r = await h.get();
  assert.equal(r.status, 302);
  assert.deepEqual(h.signedPaths, ["daily/org/program.pdf"]);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
});
for (const path of ["daily/other/private.pdf", "daily/org/../private.pdf", "daily/org/./private.pdf", "daily/org//private.pdf"]) {
  test("imported programme refuses unsafe path: " + path, async () => {
    const h = setup({ mode: "program_import", sourcePath: path });
    assert.equal((await h.get()).status, 404);
    assert.deepEqual(h.signedPaths, []);
  });
}

for (const [label, expiresAt, expected] of [
  ["legacy without expiry", null, 302],
  ["future expiry", "2030-01-01T00:00:00.000Z", 302],
  ["past expiry", "2020-01-01T00:00:00.000Z", 403],
  ["malformed expiry", "not-a-date", 403],
  ["empty expiry", "", 403],
  ["blank expiry", " ", 403],
  ["numeric expiry", 1234, 403],
]) {
  test(`private imported programme: ${label}`, async () => {
    const h = setup({ mode: "program_import", expiresAt });
    const response = await h.get();
    assert.equal(response.status, expected);
    assert.deepEqual(h.signedPaths, expected === 302 ? ["daily/org/program.pdf"] : []);
    if (expected === 403) assert.deepEqual(h.reads, ["daily_portal_access_tokens"]);
  });
}
