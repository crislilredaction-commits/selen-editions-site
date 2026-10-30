import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const orgId = "of-a";
const sessionId = "session-a";
const slotId = "slot-a";
const enrolmentId = "enrolment-a";

function fixture({ slotStatus = "open", enrolmentReadError = false, revokeError = false, forbidden = false } = {}) {
  const reads = [];
  const writes = [];
  let refreshes = 0;
  const admin = {
    from(table) {
      const filters = [];
      let operation = "select";
      let payload = null;
      const query = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        update(value) { operation = "update"; payload = value; writes.push({ table, operation, payload, filters }); return this; },
        insert(value) { operation = "insert"; payload = value; writes.push({ table, operation, payload, filters }); return this; },
        async maybeSingle() {
          reads.push({ table, filters: [...filters] });
          if (table === "daily_sessions") return { data: { id: sessionId, status: "active" }, error: null };
          if (table === "daily_attendance_slots") return { data: { id: slotId, slot_date: "2026-10-30", mode: "presentiel", status: slotStatus }, error: null };
          if (table === "daily_session_enrolments") return {
            data: enrolmentReadError ? null : { id: enrolmentId, status: "active" },
            error: enrolmentReadError ? { message: "private SQL detail" } : null,
          };
          throw new Error("Unexpected read: " + table);
        },
        then(resolve, reject) {
          if (operation === "select") throw new Error("Unexpected list read: " + table);
          return Promise.resolve({
            error: table === "daily_attendance_access_tokens" && operation === "update" && revokeError
              ? { message: "private SQL detail" } : null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const context = forbidden
    ? { ok: false, status: 403, error: "Accès refusé." }
    : { ok: true, admin, organisationId: orgId, user: { id: "user-a" } };
  const route = loadTypeScript("app/api/client/daily/attendance/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ status: options.status ?? 200, body }) } },
    "@/lib/server/dailyOrganisationContext": {
      getDailyOrganisationContext: async () => context,
      getDailyOrganisationReadContext: async () => context,
    },
    "@/lib/server/dailyAttendance": {
      attendanceChannel: () => "email",
      attendanceMode: () => "presentiel",
      createAttendanceToken: () => ({ token: "test-token", tokenHash: "test-hash" }),
    },
    "@/lib/server/dailyPosttrainingDocuments": { ensurePosttrainingDocuments: async () => {} },
    "@/lib/server/dailyAttendanceChecklist": {
      refreshDailyAttendanceChecklist: async () => { refreshes++; },
    },
  });
  const post = (action, extra = {}) => route.POST({
    url: "https://selen.example.test/api/client/daily/attendance",
    json: async () => ({ action, session_id: sessionId, ...extra }),
  });
  return { post, reads, writes, get refreshes() { return refreshes; } };
}

test("P0: panne SQL sur l'inscription refuse un nouveau lien sans révoquer l'ancien", async () => {
  const f = fixture({ enrolmentReadError: true });
  const result = await f.post("create_link", { slot_id: slotId, enrolment_id: enrolmentId });
  assert.equal(result.status, 503);
  assert.doesNotMatch(result.body.error, /private SQL detail/);
  assert.deepEqual(f.writes, []);
  assert.ok(f.reads.every(r => r.filters.some(([key, value]) => key === "organisation_id" && value === orgId)));
});

test("P0: créneau fermé ou annulé interdit la création de liens", async () => {
  for (const slotStatus of ["closed", "cancelled"]) {
    const f = fixture({ slotStatus });
    const result = await f.post("create_link", { slot_id: slotId, enrolment_id: enrolmentId });
    assert.equal(result.status, 409, slotStatus);
    assert.deepEqual(f.writes, []);
    assert.ok(!f.reads.some(r => r.table === "daily_session_enrolments"));
  }
});

test("P0: échec de révocation après fermeture n'est pas annoncé comme succès", async () => {
  const f = fixture({ revokeError: true });
  const result = await f.post("close_slot", { slot_id: slotId });
  assert.equal(result.status, 503);
  assert.doesNotMatch(result.body.error, /private SQL detail/);
  assert.equal(f.refreshes, 0);
  const revoke = f.writes.find(w => w.table === "daily_attendance_access_tokens");
  assert.ok(revoke);
  assert.equal(revoke.payload.status, "revoked");
  for (const [key, value] of [["organisation_id", orgId], ["session_id", sessionId], ["slot_id", slotId]]) {
    assert.ok(revoke.filters.some(([field, filterValue]) => field === key && filterValue === value));
  }
});

test("P0: fermeture normale révoque les liens et synchronise le suivi", async () => {
  const f = fixture();
  const result = await f.post("close_slot", { slot_id: slotId });
  assert.equal(result.status, 200);
  assert.equal(f.refreshes, 1);
  assert.equal(f.writes.length, 2);
  assert.equal(f.writes[0].table, "daily_attendance_slots");
  assert.equal(f.writes[1].table, "daily_attendance_access_tokens");
});

test("P0: refus de permission avant toute lecture ou écriture", async () => {
  const f = fixture({ forbidden: true });
  const result = await f.post("create_link", { slot_id: slotId, enrolment_id: enrolmentId });
  assert.equal(result.status, 403);
  assert.equal(f.reads.length, 0);
  assert.equal(f.writes.length, 0);
});
