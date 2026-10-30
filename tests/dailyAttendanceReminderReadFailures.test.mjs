import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const routePath = "app/api/client/daily/attendance/reminder/route.ts";
const orgId = "of-a";
const sessionId = "session-a";
const slotId = "slot-a";
const enrolmentId = "enrolment-a";

function fixture({ recentReadError = false, finalReadError = false, finalStatus = "pending", forbidden = false, correction = false } = {}) {
  const reads = [];
  const writes = [];
  const sends = [];
  let recordReads = 0;
  const admin = {
    from(table) {
      const filters = [];
      let operation = "select";
      let payload;
      const query = {
        select() { return this; },
        eq(field, value) { filters.push([field, value]); return this; },
        order() { return this; },
        limit() { return this; },
        insert(data) { operation = "insert"; payload = data; writes.push({ table, operation, data, filters }); return this; },
        update(data) { operation = "update"; payload = data; writes.push({ table, operation, data, filters }); return this; },
        async maybeSingle() {
          reads.push({ table, filters: [...filters] });
          if (table === "daily_sessions") return { data: { id: sessionId, status: "active", daily_formations: { title: "Formation test" } }, error: null };
          if (table === "daily_attendance_slots") return { data: { id: slotId, slot_date: "2026-10-30", starts_at: "09:00:00", ends_at: "12:00:00", mode: "remote", status: "active" }, error: null };
          if (table === "daily_session_enrolments") return { data: { id: enrolmentId, status: "active", daily_learners: { first_name: "Camille", last_name: "Test", email: "camille@example.test" } }, error: null };
          if (table === "daily_attendance_records") {
            recordReads++;
            if (recordReads === 1) {
              return { data: { status: "pending", evidence_metadata: correction ? { late_attendance: true, late_review: { state: "rejected", version: 2, rejection_reason: "Illisible" } } : null }, error: null };
            }
            return { data: { status: finalStatus, evidence_metadata: correction ? { late_attendance: true, late_review: { state: "rejected", version: 2 } } : null }, error: finalReadError ? { message: "private SQL detail" } : null };
          }
          if (table === "daily_attendance_access_tokens") return { data: null, error: recentReadError ? { message: "private SQL detail" } : null };
          throw new Error("Unexpected read from " + table);
        },
        async single() {
          assert.equal(operation, "insert");
          return { data: { id: table === "daily_communications" ? "communication-a" : "access-a" }, error: null };
        },
        then(resolve, reject) {
          assert.equal(operation, "update");
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const context = forbidden
    ? { ok: false, status: 403, error: "Accès refusé." }
    : { ok: true, admin, assisted: false, organisationId: orgId, user: { id: "of-user" } };
  const route = loadTypeScript(routePath, {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ status: options.status ?? 200, body }) } },
    "@/lib/server/dailyOrganisationContext": { getDailyOrganisationContext: async () => context },
    "@/lib/server/dailyAttendance": {
      attendanceChannel: () => "email",
      createAttendanceToken: () => ({ token: "private-token", tokenHash: "hashed-token" }),
    },
    "@/lib/server/dailyAttendanceEmails": {
      prepareDailyAttendanceCorrection: () => ({ subject: "Correction", text: "Texte", html: "<p>Texte</p>" }),
      prepareDailyAttendanceReminder: () => ({ subject: "Relance", text: "Texte", html: "<p>Texte</p>" }),
      sendDailyAttendanceCorrection: async () => { sends.push("correction"); return { sent: true, message: { providerMessageId: "provider-a" } }; },
      sendDailyAttendanceReminder: async () => { sends.push("reminder"); return { sent: true, message: { providerMessageId: "provider-a" } }; },
    },
  });
  const request = { url: "https://selen.example.test/api/client/daily/attendance/reminder", json: async () => ({
    session_id: sessionId, slot_id: slotId, enrolment_id: enrolmentId,
  }) };
  return { route, request, reads, writes, sends, get recordReads() { return recordReads; } };
}

test("P0: lecture des anciens jetons en panne = 503 sans réservation ni envoi", async () => {
  const f = fixture({ recentReadError: true });
  const result = await f.route.POST(f.request);
  assert.equal(result.status, 503);
  assert.doesNotMatch(result.body.error, /private SQL detail/);
  assert.equal(f.writes.length, 0);
  assert.equal(f.sends.length, 0);
  assert.equal(f.recordReads, 1);
});

test("P0: relecture de présence en panne = 503, lien révoqué et preuve failed", async () => {
  const f = fixture({ finalReadError: true });
  const result = await f.route.POST(f.request);
  assert.equal(result.status, 503);
  assert.equal(f.sends.length, 0);
  assert.equal(f.recordReads, 2);
  const revocation = f.writes.find(w => w.table === "daily_attendance_access_tokens" && w.operation === "update" && w.data.status === "revoked" && w.filters.some(([key, value]) => key === "id" && value === "access-a"));
  const failure = f.writes.find(w => w.table === "daily_communications" && w.operation === "update" && w.data.status === "failed");
  assert.ok(revocation);
  assert.equal(failure?.data.failure_reason, "attendance_state_unavailable");
  assert.ok(revocation.filters.some(([key, value]) => key === "organisation_id" && value === orgId));
  assert.ok(failure.filters.some(([key, value]) => key === "organisation_id" && value === orgId));
});

test("P0: une présence signée pendant la préparation interdit la relance", async () => {
  const f = fixture({ finalStatus: "present" });
  const result = await f.route.POST(f.request);
  assert.equal(result.status, 409);
  assert.equal(f.sends.length, 0);
  assert.ok(f.writes.some(w => w.table === "daily_communications" && w.data.failure_reason === "attendance_already_resolved"));
  assert.ok(f.writes.some(w => w.table === "daily_attendance_access_tokens" && w.data.status === "revoked"));
});

test("P0: parcours normal envoie une fois et journalise, borné au même OF", async () => {
  const f = fixture();
  const result = await f.route.POST(f.request);
  assert.equal(result.status, 200);
  assert.deepEqual(f.sends, ["reminder"]);
  assert.equal(result.body.evidenceRecorded, true);
  assert.ok(f.writes.some(w => w.table === "daily_communications" && w.data.status === "sent"));
  assert.ok(f.reads.every(r => r.filters.some(([key, value]) => key === "organisation_id" && value === orgId)));
  assert.ok(f.writes.every(w => w.operation === "insert"
    ? w.data.organisation_id === orgId
    : w.filters.some(([key, value]) => key === "organisation_id" && value === orgId)));
});

test("P0: la demande de correction rejetée conserve sa version et ne saute pas les gardes", async () => {
  const f = fixture({ correction: true });
  const result = await f.route.POST(f.request);
  assert.equal(result.status, 200);
  assert.deepEqual(f.sends, ["correction"]);
  assert.equal(result.body.kind, "correction");
  const proof = f.writes.find(w => w.table === "daily_communications" && w.operation === "insert");
  assert.equal(proof.data.communication_type, "attendance_correction_request");
  assert.equal(proof.data.metadata.review_version, "2");
});

test("P0: accès refusé = 403 avant toute lecture et sans envoi", async () => {
  const f = fixture({ forbidden: true });
  const result = await f.route.POST(f.request);
  assert.equal(result.status, 403);
  assert.equal(f.reads.length, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.sends.length, 0);
});
