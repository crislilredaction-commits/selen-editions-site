import assert from "node:assert/strict";
import test from "node:test";
import { File } from "node:buffer";
import { webcrypto } from "node:crypto";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const ORG = "org-a";
const SESSION = "session-a";
const ENROLMENT = "enrolment-a";
const SLOT = "slot-a";

function makeDb({ enrolmentError = null, slotError = null, enrolment = { id: ENROLMENT, learner_id: "learner-a", status: "confirmed" }, slot = { id: SLOT, status: "scheduled" }, attendanceRecord = null, attendanceError = null } = {}) {
  const queries = [];
  let uploadCalls = 0;
  const admin = {
    from(table) {
      const filters = [];
      const query = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        async maybeSingle() {
          queries.push({ table, filters });
          if (table === "daily_session_enrolments") return { data: enrolment, error: enrolmentError };
          if (table === "daily_attendance_slots") return { data: slot, error: slotError };
          if (table === "daily_attendance_records") return { data: attendanceRecord, error: attendanceError };
          throw new Error("Unexpected table: " + table);
        },
      };
      return query;
    },
    storage: { from(bucket) {
      assert.equal(bucket, "documents");
      return { async upload() { uploadCalls++; return { error: { message: "Test storage stop" } }; } };
    } },
  };
  return { admin, queries, get uploadCalls() { return uploadCalls; } };
}

async function submit(db, overrides = {}) {
  const values = new Map([
    ["kind", "attendance_paper"],
    ["session_id", SESSION],
    ["enrolment_id", ENROLMENT],
    ["slot_id", SLOT],
    ["file", new File(["paper proof"], "proof.pdf", { type: "application/pdf" })],
  ]);
  for (const [key, value] of Object.entries(overrides)) values.set(key, value);
  const route = loadTypeScript("app/api/client/daily/trainer-session-workspace/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ status: options.status ?? 200, body }) } },
    "@/lib/server/dailyTrainerPersonalSignature": { recordDailyTrainerPersonalSignature() { throw new Error("Not expected"); } },
    "@/lib/server/dailyEndEvaluationLifecycle": { refreshDailyEndEvaluationsChecklist() {}, tryEnsureDailyPosttrainingDocuments() {} },
    "@/lib/server/dailyAttendanceChecklist": { refreshDailyAttendanceChecklist() {} },
    "@/lib/server/dailyEndEvaluations": { activeDailyEnrolment: status => !["cancelled", "declined", "abandoned"].includes(status) },
    "@/lib/server/dailyTrainerWorkspaceContext": {
      getDailyTrainerWorkspaceContext: async () => ({ ok: true, admin: db.admin, orgId: ORG, trainerId: "trainer-a", trainerName: "Trainer", user: { id: "user-a" } }),
      getAssignedDailyTrainerSession: async (_context, sessionId) => sessionId === SESSION ? { id: SESSION, formation_id: "formation-a" } : null,
    },
  }, { File, crypto: webcrypto, Uint8Array });
  return route.POST({ formData: async () => ({ get: key => values.get(key) ?? null }) });
}

test("paper attendance: cancelled slot rejects upload and any attendance mutation", async () => {
  const db = makeDb({ slot: { id: SLOT, status: "cancelled" } });
  const response = await submit(db);
  assert.equal(response.status, 409);
  assert.equal(db.uploadCalls, 0);
  assert.deepEqual(db.queries.map(q => q.table), ["daily_session_enrolments", "daily_attendance_slots"]);
  for (const q of db.queries) {
    assert.ok(q.filters.some(([key, value]) => key === "organisation_id" && value === ORG));
    assert.ok(q.filters.some(([key, value]) => key === "session_id" && value === SESSION));
  }
});

test("paper attendance: slot SQL error fails closed before uploading", async () => {
  const db = makeDb({ slotError: { message: "database unavailable" } });
  assert.equal((await submit(db)).status, 500);
  assert.equal(db.uploadCalls, 0);
});

test("paper attendance: enrolment SQL error fails closed before reading slots or uploading", async () => {
  const db = makeDb({ enrolmentError: { message: "database unavailable" } });
  assert.equal((await submit(db)).status, 500);
  assert.equal(db.uploadCalls, 0);
  assert.equal(db.queries.length, 1);
});

test("paper attendance: missing or inactive learner never uploads", async () => {
  for (const enrolment of [null, { id: ENROLMENT, learner_id: "learner-a", status: "abandoned" }]) {
    const db = makeDb({ enrolment });
    assert.equal((await submit(db)).status, 404);
    assert.equal(db.uploadCalls, 0);
  }
});

test("paper attendance: missing or foreign slot never uploads", async () => {
  const db = makeDb({ slot: null });
  assert.equal((await submit(db)).status, 404);
  assert.equal(db.uploadCalls, 0);
});

test("paper attendance: active slot reaches upload with organisation and session scoped checks", async () => {
  const db = makeDb();
  const response = await submit(db);
  assert.equal(response.status, 500); // Intentional storage stub, not a business rejection.
  assert.equal(db.uploadCalls, 1);
  assert.ok(db.queries.every(q => q.filters.some(([key, value]) => key === "organisation_id" && value === ORG)));
});

test("paper attendance: existing signed, validated or decided attendance cannot be overwritten", async () => {
  const variants = [
    { status: "present", signed_at: "2026-10-29T04:00:00Z" },
    { status: "pending", signed_at: "2026-10-29T04:00:00Z" },
    { status: "pending", validated_at: "2026-10-29T04:00:00Z" },
    { status: "pending", signature_storage_path: "daily/org-a/signed.png" },
    { status: "absent" },
    { status: "excused" },
  ];
  for (const variant of variants) {
    const db = makeDb({ attendanceRecord: { id: "record-a", signed_at: null, validated_at: null, signature_storage_path: null, ...variant } });
    const response = await submit(db);
    assert.equal(response.status, 409, JSON.stringify(variant));
    assert.equal(db.uploadCalls, 0, JSON.stringify(variant));
    assert.equal(db.queries.at(-1).table, "daily_attendance_records");
    assert.ok(db.queries.at(-1).filters.some(([key, value]) => key === "organisation_id" && value === ORG));
    assert.ok(db.queries.at(-1).filters.some(([key, value]) => key === "session_id" && value === SESSION));
  }
});

test("paper attendance: SQL errors checking existing proofs fail closed", async () => {
  const db = makeDb({ attendanceError: { message: "database unavailable" } });
  assert.equal((await submit(db)).status, 500);
  assert.equal(db.uploadCalls, 0);
});

test("paper attendance: a pending record without signature can proceed to upload", async () => {
  const db = makeDb({ attendanceRecord: { id: "record-a", status: "pending", signed_at: null, validated_at: null, signature_storage_path: null } });
  assert.equal((await submit(db)).status, 500); // Intentional storage failure in the stub.
  assert.equal(db.uploadCalls, 1);
});
