import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";
import { isValidPortalExpiry } from "../lib/daily/portalAttendanceAccess.mjs";

function fixture({ expiry = "2099-01-01T00:00:00Z", accessError = false, verificationExpiry = "not-a-date" } = {}) {
  const reads = [];
  const writes = [];
  const token = {
    id: "access-1", organisation_id: "of-1", session_id: "session-1",
    slot_id: "slot-1", enrolment_id: null, access_type: "shared",
    channel: "email", status: "active", expires_at: expiry,
  };
  const admin = {
    from(table) {
      reads.push(table);
      const query = {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return this; },
        update(value) { writes.push({ table, value }); return this; },
        maybeSingle() {
          if (table === "daily_attendance_access_tokens") {
            return Promise.resolve({ data: accessError ? null : token,
              error: accessError ? { message: "private SQL 42P01" } : null });
          }
          const data = {
            daily_attendance_slots: { id: "slot-1", status: "open", slot_date: "2026-11-01" },
            daily_sessions: { id: "session-1", internal_reference: "S1", daily_formations: { title: "Test" } },
            daily_learners: { id: "learner-1", email: "alice@example.test", first_name: "Alice" },
            daily_session_enrolments: { id: "enrolment-1", learner_id: "learner-1", status: "active" },
            daily_attendance_verifications: { id: "verification-1", status: "pending", expires_at: verificationExpiry },
          }[table];
          if (!data) throw new Error("Unexpected read: " + table);
          return Promise.resolve({ data, error: null });
        },
        then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
      };
      return query;
    },
  };
  const { GET, POST } = loadTypeScript("app/api/daily-attendance/[token]/route.ts", {
    crypto: { randomUUID: () => "uuid" },
    "next/server": { NextResponse: { json: (body, options = {}) => ({
      body, status: options.status ?? 200, headers: options.headers ?? {},
    }) } },
    "@/lib/daily/portalAttendanceAccess.mjs": { isValidPortalExpiry },
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
    "@/lib/server/dailyAttendanceChecklist": { refreshDailyAttendanceChecklist: async () => {} },
    "@/lib/server/dailyAttendanceEmails": { sendDailyAttendanceVerificationCode: async () => ({ sent: true }) },
    "@/lib/server/dailyAttendance": {
      attendanceSlotHasStarted: () => true,
      buildAttendanceProofHash: () => "proof",
      createAttendanceVerificationCode: () => ({ code: "123456", codeHash: "hash" }),
      hashAttendanceEmail: () => "email-hash",
      hashAttendanceSignature: () => "signature-hash",
      hashAttendanceToken: () => "token-hash",
      hashAttendanceVerificationCode: () => "code-hash",
      signatureBufferFromDataUrl: () => ({}),
      DAILY_ATTENDANCE_CONSENT: "Consentement",
    },
  });
  const params = { params: Promise.resolve({ token: "secret-token" }) };
  const get = () => GET({}, params);
  const post = (body = {}) => POST({
    json: async () => body,
    headers: { get: () => null },
  }, params);
  return { get, post, reads, writes };
}

for (const expiry of [null, "", "9999", "not-a-date", "2099-02-30T12:00:00Z", "2020-01-01T00:00:00Z"]) {
  test("P0: invalid attendance link expiry fails closed on GET and POST: " + String(expiry), async () => {
    const f = fixture({ expiry });
    const get = await f.get();
    const post = await f.post({ action: "request_code", email: "alice@example.test" });
    assert.equal(get.status, 410);
    assert.equal(post.status, 410);
    assert.equal(get.headers["Cache-Control"], "private, no-store");
    assert.equal(post.headers["Cache-Control"], "private, no-store");
    assert.deepEqual(f.reads, ["daily_attendance_access_tokens", "daily_attendance_access_tokens"]);
    assert.deepEqual(f.writes, []);
  });
}

test("P0: valid attendance link still opens with private no-store response", async () => {
  const f = fixture();
  const response = await f.get();
  assert.equal(response.status, 200);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.equal(response.body.requiresEmailCode, true);
  assert.ok(f.reads.includes("daily_sessions"));
});

test("P0: SQL error from access token lookup is not exposed on GET or POST", async () => {
  const f = fixture({ accessError: true });
  for (const response of [await f.get(), await f.post({})]) {
    assert.equal(response.status, 503);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
    assert.doesNotMatch(response.body.error, /SQL|42P01|private/);
  }
  assert.deepEqual(f.writes, []);
});

test("P0: malformed verification expiry rejects a shared attendance signature before upload", async () => {
  const f = fixture({ verificationExpiry: "2099-02-30T12:00:00Z" });
  const response = await f.post({
    consent: true, signature_data: "data:image/png;base64,AAA",
    email: "alice@example.test", verification_id: "verification-1", code: "123456",
  });
  assert.equal(response.status, 410);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.match(response.body.error, /expiré/);
  assert.ok(f.writes.some(write => write.table === "daily_attendance_verifications" && write.value.status === "expired"));
  assert.ok(!f.writes.some(write => write.table === "daily_attendance_records"));
});
