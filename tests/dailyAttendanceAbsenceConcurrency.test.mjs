import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const organisationId = "of-test";
const sessionId = "session-test";
const slotId = "slot-test";
const enrolmentId = "enrolment-test";
const recordId = "record-test";
const updatedAt = "2026-10-30T12:00:00.000Z";

function fixture({ missing = false, signed = false, readError = false, updateError = false, conflict = false, forbidden = false, reviewPending = false } = {}) {
  const reads = [];
  const writes = [];
  let refreshes = 0;
  let generated = 0;
  const admin = {
    from(table) {
      const state = { table, operation: "read", filters: [], payload: null };
      const query = {
        select() { return this; },
        eq(key, value) { state.filters.push(["eq", key, value]); return this; },
        neq(key, value) { state.filters.push(["neq", key, value]); return this; },
        is(key, value) { state.filters.push(["is", key, value]); return this; },
        update(payload) { state.operation = "update"; state.payload = payload; return this; },
        async maybeSingle() {
          if (table === "daily_sessions") return { data: { id: sessionId, status: "active" }, error: null };
          if (table !== "daily_attendance_records") throw new Error("Unexpected table " + table);
          if (state.operation === "read") {
            reads.push([...state.filters]);
            return {
              data: missing || readError ? null : {
                id: recordId, status: signed ? "present" : "pending", updated_at: updatedAt,
                evidence_metadata: reviewPending
                  ? { late_attendance: true, late_review: { state: "awaiting_validation" } } : {},
              },
              error: readError ? { message: "private SQL detail" } : null,
            };
          }
          writes.push({ ...state, filters: [...state.filters] });
          return {
            data: conflict || updateError ? null : { id: recordId },
            error: updateError ? { message: "private SQL detail" } : null,
          };
        },
      };
      return query;
    },
  };
  const context = forbidden
    ? { ok: false, status: 403, error: "Accès refusé." }
    : { ok: true, admin, organisationId, user: { id: "user-test" } };
  const route = loadTypeScript("app/api/client/daily/attendance/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ status: options.status ?? 200, body }) } },
    "@/lib/server/dailyOrganisationContext": {
      getDailyOrganisationContext: async () => context,
      getDailyOrganisationReadContext: async () => context,
    },
    "@/lib/server/dailyAttendance": {
      attendanceChannel: () => "link", attendanceMode: () => "presentiel",
      createAttendanceToken: () => ({ token: "unused", tokenHash: "unused" }),
    },
    "@/lib/server/dailyPosttrainingDocuments": {
      ensurePosttrainingDocuments: async () => { generated++; },
    },
    "@/lib/server/dailyAttendanceChecklist": {
      refreshDailyAttendanceChecklist: async () => { refreshes++; },
    },
  });
  const post = () => route.POST({
    url: "https://selen.example.test/api/client/daily/attendance",
    json: async () => ({
      action: "set_absence", session_id: sessionId, slot_id: slotId,
      enrolment_id: enrolmentId, status: "absent",
    }),
  });
  return { post, reads, writes, get refreshes() { return refreshes; }, get generated() { return generated; } };
}

test("P0 : émargement absent ne produit plus un faux succès", async () => {
  const f = fixture({ missing: true });
  const response = await f.post();
  assert.equal(response.status, 404);
  assert.equal(f.writes.length, 0);
  assert.equal(f.refreshes, 0);
});

test("P0 : présence signée préservée, sans écriture", async () => {
  const f = fixture({ signed: true });
  const response = await f.post();
  assert.equal(response.status, 409);
  assert.equal(f.writes.length, 0);
  assert.equal(f.generated, 0);
});

test("P0 : correction tardive en attente protégée", async () => {
  const f = fixture({ reviewPending: true });
  const response = await f.post();
  assert.equal(response.status, 409);
  assert.equal(f.writes.length, 0);
});

test("P0 : panne SQL de lecture ou d'écriture n'expose aucun détail", async () => {
  for (const option of [{ readError: true }, { updateError: true }]) {
    const f = fixture(option);
    const response = await f.post();
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(response.body), /private SQL detail/);
    assert.equal(f.refreshes, 0);
    assert.equal(f.generated, 0);
  }
});

test("P0 : modification concurrente bloque la décision périmée", async () => {
  const f = fixture({ conflict: true });
  const response = await f.post();
  assert.equal(response.status, 409);
  assert.equal(f.writes.length, 1);
  assert.equal(f.refreshes, 0);
});

test("P0 : mise à jour réelle, limitée à l'OF, la session, le créneau, l'apprenant et la version", async () => {
  const f = fixture();
  const response = await f.post();
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(f.writes.length, 1);
  const write = f.writes[0];
  assert.equal(write.table, "daily_attendance_records");
  assert.equal(write.payload.status, "absent");
  for (const [key, value] of [
    ["id", recordId], ["organisation_id", organisationId], ["session_id", sessionId],
    ["slot_id", slotId], ["enrolment_id", enrolmentId], ["updated_at", updatedAt],
  ]) {
    assert.ok(write.filters.some(([op, k, v]) => op === "eq" && k === key && v === value), key);
  }
  assert.ok(write.filters.some(([op, key, value]) => op === "neq" && key === "status" && value === "present"));
  assert.equal(f.refreshes, 1);
  assert.equal(f.generated, 1);
});

test("P0 : accès OF refusé avant toute lecture ou écriture", async () => {
  const f = fixture({ forbidden: true });
  const response = await f.post();
  assert.equal(response.status, 403);
  assert.equal(f.reads.length, 0);
  assert.equal(f.writes.length, 0);
});
