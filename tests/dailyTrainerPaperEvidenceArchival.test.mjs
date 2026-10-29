import assert from "node:assert/strict";
import test from "node:test";
import { File } from "node:buffer";
import { webcrypto } from "node:crypto";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const ORG = "org-a";
const SESSION = "session-a";
const ENROLMENT = "enrolment-a";
const SLOT = "slot-a";
const DOCUMENT = "document-a";

function makeDb({ attendanceWrite = { data: null, error: null }, archiveResult = { data: { id: DOCUMENT }, error: null }, existing = { id: "record-a", status: "pending", signed_at: null, validated_at: null, signature_storage_path: null } } = {}) {
  const operations = [];
  const admin = {
    from(table) {
      const state = { table, kind: "read", filters: [], payload: null };
      const query = {
        select() { return this; },
        eq(key, value) { state.filters.push([key, value]); return this; },
        is(key, value) { state.filters.push([key, value]); return this; },
        update(payload) { state.kind = "update"; state.payload = payload; return this; },
        insert(payload) { state.kind = "insert"; state.payload = payload; return this; },
        async maybeSingle() {
          operations.push({ ...state, filters: [...state.filters] });
          if (table === "daily_session_enrolments") return { data: { id: ENROLMENT, learner_id: "learner-a", status: "confirmed" }, error: null };
          if (table === "daily_attendance_slots") return { data: { id: SLOT, status: "scheduled" }, error: null };
          if (table === "daily_attendance_records" && state.kind === "read") return { data: existing, error: null };
          if (table === "daily_attendance_records" && state.kind === "update") return attendanceWrite;
          if (table === "daily_documents" && state.kind === "update") return archiveResult;
          throw Error("Unexpected query: " + table + " " + state.kind);
        },
        async single() {
          operations.push({ ...state, filters: [...state.filters] });
          if (table === "daily_documents" && state.kind === "insert") return { data: { id: DOCUMENT }, error: null };
          if (table === "daily_attendance_records" && state.kind === "insert") return attendanceWrite;
          throw Error("Unexpected insert: " + table);
        },
      };
      return query;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "documents");
        return {
          async upload() { operations.push({ kind: "upload" }); return { error: null }; },
          async remove() { operations.push({ kind: "remove" }); return { error: null }; },
        };
      },
    },
  };
  return { admin, operations };
}

async function submit(db) {
  const values = new Map([
    ["kind", "attendance_paper"], ["session_id", SESSION],
    ["enrolment_id", ENROLMENT], ["slot_id", SLOT],
    ["file", new File(["paper proof"], "proof.pdf", { type: "application/pdf" })],
  ]);
  const route = loadTypeScript("app/api/client/daily/trainer-session-workspace/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ status: options.status ?? 200, body }) } },
    "@/lib/server/dailyTrainerPersonalSignature": { recordDailyTrainerPersonalSignature() { throw Error("Not expected"); } },
    "@/lib/server/dailyEndEvaluationLifecycle": { refreshDailyEndEvaluationsChecklist() {}, tryEnsureDailyPosttrainingDocuments() {} },
    "@/lib/server/dailyAttendanceChecklist": { refreshDailyAttendanceChecklist() {} },
    "@/lib/server/dailyEndEvaluations": { activeDailyEnrolment: status => !["cancelled", "declined", "abandoned"].includes(status) },
    "@/lib/server/dailyTrainerWorkspaceContext": {
      getDailyTrainerWorkspaceContext: async () => ({ ok: true, admin: db.admin, orgId: ORG, trainerId: "trainer-a", trainerName: "Trainer", user: { id: "user-a" } }),
      getAssignedDailyTrainerSession: async (_context, id) => id === SESSION ? { id: SESSION, formation_id: "formation-a" } : null,
    },
  }, { File, crypto: webcrypto, Uint8Array, console: { error() {} } });
  return route.POST({ formData: async () => ({ get: key => values.get(key) ?? null }) });
}

function assertArchived(db, reason) {
  const archive = db.operations.find(op => op.table === "daily_documents" && op.kind === "update");
  assert.ok(archive, "The uploaded document must be archived");
  assert.equal(archive.payload.status, "archived");
  assert.equal(archive.payload.is_current, false);
  assert.equal(archive.payload.metadata.attendance_import_outcome, reason);
  for (const [key, value] of [["id", DOCUMENT], ["organisation_id", ORG], ["session_id", SESSION], ["document_type", "attendance_paper_evidence"]]) {
    assert.ok(archive.filters.some(([field, actual]) => field === key && actual === value), key + " must be scoped");
  }
  assert.equal(db.operations.filter(op => op.kind === "remove").length, 0, "Retain uploaded proof for audit");
}

test("paper proof: concurrent signed attendance archives the unlinked document and returns 409", async () => {
  const db = makeDb();
  const response = await submit(db);
  assert.equal(response.status, 409);
  assertArchived(db, "attendance_conflict");
});

test("paper proof: attendance SQL failure archives the unlinked document and returns 500", async () => {
  const db = makeDb({ attendanceWrite: { data: null, error: { message: "database unavailable" } } });
  const response = await submit(db);
  assert.equal(response.status, 500);
  assertArchived(db, "attendance_write_failed");
});

test("paper proof: archival failure is reported for administrative remediation", async () => {
  const db = makeDb({ archiveResult: { data: null, error: { message: "archive failed" } } });
  const response = await submit(db);
  assert.equal(response.status, 500);
  assert.match(response.body.error, /vérification administrative/);
  assert.equal(db.operations.filter(op => op.kind === "remove").length, 0);
});

test("paper proof: successful attendance does not archive its evidence", async () => {
  const db = makeDb({ attendanceWrite: { data: { id: "record-a" }, error: null } });
  const response = await submit(db);
  assert.equal(response.status, 200);
  assert.equal(response.body.document_id, DOCUMENT);
  assert.equal(db.operations.filter(op => op.table === "daily_documents" && op.kind === "update").length, 0);
});

test("paper proof: duplicate concurrent insert also archives an unlinked document", async () => {
  const db = makeDb({ existing: null, attendanceWrite: { data: null, error: { code: "23505", message: "unique violation" } } });
  const response = await submit(db);
  assert.equal(response.status, 500);
  assertArchived(db, "attendance_write_failed");
});
