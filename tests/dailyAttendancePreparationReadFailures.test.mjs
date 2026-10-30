import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const organisationId = "of-test";
const sessionId = "session-test";
const slotId = "slot-test";
const slotKey = "2026-11-02-09:00-12:00-1";

function fixture({ slotsReadError = false, enrolmentsReadError = false, forbidden = false } = {}) {
  const queries = [];
  const writes = [];
  let slotReads = 0;
  let enrolmentReads = 0;
  let refreshes = 0;
  const session = {
    id: sessionId, organisation_id: organisationId, status: "active",
    schedule_blocks: [{ date: "2026-11-02", start: "09:00", end: "12:00" }],
    modality: "presentiel",
  };
  const admin = {
    from(table) {
      const filters = [];
      let operation = "select";
      const query = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        in() { return this; },
        order() { return this; },
        upsert(rows) {
          operation = "upsert";
          writes.push({ table, rows, filters: [...filters] });
          return this;
        },
        async maybeSingle() {
          queries.push({ table, filters: [...filters] });
          if (table === "daily_sessions") return { data: session, error: null };
          throw new Error("Unexpected single read: " + table);
        },
        then(resolve, reject) {
          if (operation === "select") queries.push({ table, filters: [...filters] });
          let result;
          if (operation === "upsert") {
            result = { error: null };
          } else if (table === "daily_attendance_slots") {
            slotReads++;
            result = slotReads === 1
              ? { data: [], error: null }
              : slotReads === 2 && slotsReadError
                ? { data: null, error: { message: "private slots SQL detail" } }
                : { data: slotReads === 2 ? [{ id: slotId, slot_key: slotKey, status: "draft" }] : [], error: null };
          } else if (table === "daily_session_enrolments") {
            enrolmentReads++;
            result = enrolmentReads === 1 && enrolmentsReadError
              ? { data: null, error: { message: "private enrolments SQL detail" } }
              : { data: [{ id: "active-enrolment", status: "active" }, { id: "cancelled-enrolment", status: "cancelled" }], error: null };
          } else if (table === "daily_communications") {
            result = { data: [], error: null };
          } else {
            throw new Error("Unexpected list read: " + table);
          }
          return Promise.resolve(result).then(resolve, reject);
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
      attendanceChannel: () => "link",
      attendanceMode: () => "presentiel",
      createAttendanceToken: () => ({ token: "unused", tokenHash: "unused" }),
    },
    "@/lib/server/dailyPosttrainingDocuments": { ensurePosttrainingDocuments: async () => {} },
    "@/lib/server/dailyAttendanceChecklist": {
      refreshDailyAttendanceChecklist: async () => { refreshes++; },
    },
  });
  const post = () => route.POST({
    url: "https://selen.example.test/api/client/daily/attendance",
    json: async () => ({ action: "prepare_session", session_id: sessionId }),
  });
  return { post, writes, queries, get refreshes() { return refreshes; } };
}

for (const [label, options] of [
  ["créneaux", { slotsReadError: true }],
  ["inscriptions", { enrolmentsReadError: true }],
]) {
  test("P0: panne SQL de lecture des " + label + " bloque la préparation sans faux succès", async () => {
    const f = fixture(options);
    const response = await f.post();
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(response.body), /private.*SQL detail/);
    assert.equal(f.refreshes, 0);
    assert.ok(!f.writes.some(w => w.table === "daily_attendance_records"));
    assert.ok(f.queries.every(q => q.filters.some(([key, value]) => key === "organisation_id" && value === organisationId)));
  });
}

test("P0: préparation réussie crée les émargements des seuls inscrits actifs", async () => {
  const f = fixture();
  const response = await f.post();
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(f.refreshes, 1);
  const records = f.writes.find(w => w.table === "daily_attendance_records");
  assert.ok(records);
  assert.deepEqual(records.rows.map(row => row.enrolment_id), ["active-enrolment"]);
  assert.ok(records.rows.every(row => row.organisation_id === organisationId && row.session_id === sessionId && row.slot_id === slotId));
});

test("P0: accès OF refusé avant toute lecture et écriture", async () => {
  const f = fixture({ forbidden: true });
  const response = await f.post();
  assert.equal(response.status, 403);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.queries, []);
});
