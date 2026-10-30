import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const organisationId = "of-test";
const sessionId = "session-test";
const slotId = "slot-test";
const enrolmentId = "enrolment-test";
const tokenHash = "a".repeat(64);

function fixture({ insertError = false, revokeError = false, rollbackError = false, forbidden = false } = {}) {
  const writes = [];
  const logs = [];
  const admin = {
    from(table) {
      const filters = [];
      let operation = "select";
      let payload;
      const query = {
        select() { return this; },
        eq(key, value) { filters.push(["eq", key, value]); return this; },
        neq(key, value) { filters.push(["neq", key, value]); return this; },
        is(key, value) { filters.push(["is", key, value]); return this; },
        insert(value) { operation = "insert"; payload = value; return this; },
        update(value) { operation = "update"; payload = value; return this; },
        async maybeSingle() {
          if (table === "daily_sessions") return { data: { id: sessionId, status: "active" }, error: null };
          if (table === "daily_attendance_slots") return {
            data: { id: slotId, slot_date: "2026-10-30", mode: "presentiel", status: "open" }, error: null,
          };
          if (table === "daily_session_enrolments") return { data: { id: enrolmentId, status: "active" }, error: null };
          throw new Error("Unexpected read: " + table);
        },
        then(resolve, reject) {
          if (operation === "select") throw new Error("Unexpected list read: " + table);
          const write = { table, operation, payload, filters: [...filters] };
          writes.push(write);
          const isOldRotation = filters.some(([op, key]) => op === "neq" && key === "token_hash");
          const isCompensation = filters.some(([op, key]) => op === "eq" && key === "token_hash");
          const error = table === "daily_attendance_access_tokens" && (
            (operation === "insert" && insertError)
            || (operation === "update" && isOldRotation && revokeError)
            || (operation === "update" && isCompensation && rollbackError)
          ) ? { message: "private SQL detail" } : null;
          return Promise.resolve({ error }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const context = forbidden
    ? { ok: false, status: 403, error: "Accès refusé." }
    : { ok: true, admin, organisationId, user: { id: "agent-test" } };
  const route = loadTypeScript("app/api/client/daily/attendance/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ status: options.status ?? 200, body }) } },
    "@/lib/server/dailyOrganisationContext": {
      getDailyOrganisationContext: async () => context,
      getDailyOrganisationReadContext: async () => context,
    },
    "@/lib/server/dailyAttendance": {
      attendanceChannel: () => "link",
      attendanceMode: () => "presentiel",
      createAttendanceToken: () => ({ token: "secret-not-to-disclose", tokenHash }),
    },
    "@/lib/server/dailyPosttrainingDocuments": { ensurePosttrainingDocuments: async () => {} },
    "@/lib/server/dailyAttendanceChecklist": { refreshDailyAttendanceChecklist: async () => {} },
  }, { console: { error: (...args) => logs.push(args) } });
  const post = (extra = {}) => route.POST({
    url: "https://selen.example.test/api/client/daily/attendance",
    json: async () => ({ action: "create_link", session_id: sessionId, slot_id: slotId, enrolment_id: enrolmentId, ...extra }),
  });
  return { post, writes, logs };
}

function hasFilter(write, op, key, value) {
  return write.filters.some(([filterOp, filterKey, filterValue]) =>
    filterOp === op && filterKey === key && filterValue === value);
}

test("P0: insertion SQL refusée : l'ancien lien n'est jamais révoqué", async () => {
  const f = fixture({ insertError: true });
  const result = await f.post();
  assert.equal(result.status, 503);
  assert.deepEqual(f.writes.map(w => w.operation), ["insert"]);
  assert.doesNotMatch(JSON.stringify(result.body), /secret-not-to-disclose|private SQL detail/);
});

test("P0: révocation échouée : compensation ciblée et aucun nouveau lien divulgué", async () => {
  const f = fixture({ revokeError: true });
  const result = await f.post();
  assert.equal(result.status, 503);
  assert.deepEqual(f.writes.map(w => w.operation), ["insert", "update", "update"]);
  assert.ok(hasFilter(f.writes[1], "neq", "token_hash", tokenHash));
  assert.ok(hasFilter(f.writes[2], "eq", "token_hash", tokenHash));
  for (const write of f.writes) {
    if (write.operation === "insert") {
      assert.equal(write.payload.organisation_id, organisationId);
      assert.equal(write.payload.session_id, sessionId);
      assert.equal(write.payload.slot_id, slotId);
    } else {
      assert.ok(hasFilter(write, "eq", "organisation_id", organisationId));
      assert.ok(hasFilter(write, "eq", "session_id", sessionId));
      assert.ok(hasFilter(write, "eq", "slot_id", slotId));
    }
  }
  assert.doesNotMatch(JSON.stringify(result.body), /secret-not-to-disclose|private SQL detail/);
});

test("P0: rotation réussie : seul l'ancien lien du bon apprenant est révoqué", async () => {
  const f = fixture();
  const result = await f.post();
  assert.equal(result.status, 200);
  assert.equal(result.body.token, "secret-not-to-disclose");
  assert.deepEqual(f.writes.map(w => w.operation), ["insert", "update"]);
  assert.ok(hasFilter(f.writes[1], "eq", "enrolment_id", enrolmentId));
  assert.ok(hasFilter(f.writes[1], "neq", "token_hash", tokenHash));
  assert.ok(hasFilter(f.writes[1], "eq", "organisation_id", organisationId));
  assert.ok(hasFilter(f.writes[1], "eq", "session_id", sessionId));
  assert.ok(hasFilter(f.writes[1], "eq", "slot_id", slotId));
});

test("P0: lien collectif : révocation limitée aux anciens liens partagés", async () => {
  const f = fixture();
  const result = await f.post({ enrolment_id: "" });
  assert.equal(result.status, 200);
  assert.equal(f.writes[0].payload.access_type, "shared");
  assert.equal(f.writes[0].payload.enrolment_id, null);
  assert.ok(hasFilter(f.writes[1], "is", "enrolment_id", null));
  assert.ok(hasFilter(f.writes[1], "neq", "token_hash", tokenHash));
});

test("P0: échec de compensation : erreur explicite, jamais de secret renvoyé", async () => {
  const f = fixture({ revokeError: true, rollbackError: true });
  const result = await f.post();
  assert.equal(result.status, 503);
  assert.equal(f.logs.length, 1);
  assert.doesNotMatch(JSON.stringify(result.body), /secret-not-to-disclose|private SQL detail/);
});

test("P0: accès refusé : aucune écriture ni génération de lien", async () => {
  const f = fixture({ forbidden: true });
  const result = await f.post();
  assert.equal(result.status, 403);
  assert.deepEqual(f.writes, []);
});
