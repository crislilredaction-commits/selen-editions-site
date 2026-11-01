import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const routePath = "app/api/daily-portal/[token]/attendance/route.ts";
const source = await readFile(new URL("../" + routePath, import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function makeRoute(failingTable = null, role = "learner", active = true) {
  const reads = [];
  const learnerRows = [
    { id: "enrolment-1", learner_id: "learner-1", status: "active",
      daily_learners: { id: "learner-1", first_name: "Alice", last_name: "Test", email: "alice@example.test" } },
    { id: "enrolment-2", learner_id: "learner-2", status: "active",
      daily_learners: { id: "learner-2", first_name: "Bob", last_name: "Test", email: "bob@example.test" } },
  ];
  const fixtures = {
    daily_portal_access_tokens: {
      id: "token-1", session_id: "session-1", portal_type: role,
      entity_key: "learner:learner-1", entity_email: "alice@example.test",
      status: active ? "viewed" : "revoked", expires_at: "2099-01-01T00:00:00Z",
    },
    daily_sessions: {
      id: "session-1", organisation_id: "of-1", status: "scheduled",
      daily_formations: { title: "Formation test" },
    },
    daily_attendance_slots: [
      { id: "slot-1", slot_date: "2026-11-01", starts_at: "09:00",
        ends_at: "12:00", label: "Matin", status: "open" },
    ],
    daily_session_enrolments: learnerRows,
    daily_attendance_records: [
      { id: "record-1", slot_id: "slot-1", enrolment_id: "enrolment-1",
        status: "present", signed_at: null, evidence_metadata: {} },
    ],
    daily_communications: [],
  };
  const admin = {
    from(table) {
      reads.push(table);
      const result = () => ({
        data: fixtures[table],
        error: table === failingTable
          ? { message: "SQL secret: private_table 42P01", code: "42P01" }
          : null,
      });
      const query = {
        select() { return this; },
        eq() { return this; },
        neq() { return this; },
        in() { return this; },
        order() { return this; },
        maybeSingle() { return Promise.resolve(result()); },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return query;
    },
  };
  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod, exports: mod.exports, Date, Intl, Promise, URL, Map, Set,
    require(name) {
      if (name === "next/server") return {
        NextResponse: {
          json: (body, options = {}) => ({
            body, status: options.status ?? 200, headers: options.headers ?? {},
          }),
        },
      };
      if (name === "@/lib/server/clientNdaAccess") return { getAdminSupabase: () => admin };
      if (name === "@/lib/dailyAttendanceState") return {
        dailyAttendanceSummary: (statuses) => ({ statuses }),
      };
      if (name === "@/lib/server/dailyPortalLearnerIdentity") return {
        findUniqueDailyLearnerPortalEnrolment: (access, rows) =>
          rows.find((row) => access.entity_key === "learner:" + row.learner_id) ?? null,
      };
      if (name === "@/lib/daily/portalAttendanceAccess.mjs") return {
        isActivePortalAttendanceToken: (status) => status === "pending" || status === "viewed",
      };
      throw Error("Unexpected import: " + name);
    },
  }, { filename: routePath });
  return { GET: mod.exports.GET, reads };
}

for (const table of [
  "daily_portal_access_tokens", "daily_sessions", "daily_attendance_slots",
  "daily_session_enrolments", "daily_attendance_records", "daily_communications",
]) {
  test("attendance portal: SQL read failure in " + table + " is private and retryable", async () => {
    const { GET, reads } = makeRoute(table);
    const response = await GET({}, { params: Promise.resolve({ token: "token-test" }) });
    assert.equal(response.status, 503);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
    assert.match(response.body.error, /temporairement indisponible/);
    assert.doesNotMatch(response.body.error, /SQL secret|private_table|42P01/);
    assert.ok(reads.includes(table));
  });
}

test("attendance portal: learner response is uncached and contains only their enrolment", async () => {
  const { GET } = makeRoute();
  const response = await GET({}, { params: Promise.resolve({ token: "token-test" }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.equal(response.body.role, "learner");
  assert.equal(response.body.participants.length, 1);
  assert.equal(response.body.participants[0].id, "enrolment-1");
  assert.equal(response.body.slots[0].attendance.length, 1);
  assert.equal(response.body.slots[0].attendance[0].enrolmentId, "enrolment-1");
});

test("attendance portal: trainer sees active session participants, never cached", async () => {
  const { GET } = makeRoute(null, "trainer");
  const response = await GET({}, { params: Promise.resolve({ token: "token-test" }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.equal(response.body.participants.length, 2);
});

test("attendance portal: revoked token is rejected without reading session data", async () => {
  const { GET, reads } = makeRoute(null, "learner", false);
  const response = await GET({}, { params: Promise.resolve({ token: "token-test" }) });
  assert.equal(response.status, 410);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.deepEqual(reads, ["daily_portal_access_tokens"]);
});

test("attendance portal: SQL messages cannot be serialized and endpoint stays read-only", () => {
  assert.doesNotMatch(source, /error:(?:accessError|sessionError|readError)\.message/);
  assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete)\(/);
  assert.match(source, /\.eq\("session_id",session\.id\\)\.eq\("organisation_id",session\.organisation_id\\)/);
});
