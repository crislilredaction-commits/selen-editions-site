import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";
import { isValidPortalExpiry } from "../lib/daily/portalAttendanceAccess.mjs";

const organisationId = "of-1";
const sessionId = "session-1";
const requestId = "123e4567-e89b-42d3-a456-426614174000";
const params = { params: Promise.resolve({ token: "trainer-token" }) };

function fixture(failure = null, role = "trainer") {
  const calls = [];
  const entry = { id: requestId, status: "open", summary: "Incident" };
  const admin = {
    from(table) {
      const state = { table, operation: "read", filters: [], count: false };
      calls.push(state);
      const query = {
        select(_fields, options) { state.count = options?.count === "exact"; return this; },
        eq(key, value) { state.filters.push([key, value]); return this; },
        neq() { return this; },
        order() { return this; },
        insert(payload) { state.operation = "insert"; state.payload = payload; return this; },
        update(payload) { state.operation = "update"; state.payload = payload; return this; },
        async maybeSingle() {
          if (table === "daily_portal_access_tokens") return {
            data: { id: "token-1", portal_type: role, session_id: sessionId, status: "viewed", expires_at: null, entity_name: "Formateur" },
            error: failure === "access" ? { message: "private SQL" } : null,
          };
          if (table === "daily_sessions") return {
            data: { id: sessionId, organisation_id: organisationId },
            error: failure === "session" ? { message: "private SQL" } : null,
          };
          if (table === "daily_session_enrolments") return {
            data: { id: "enrolment-1", status: "active" },
            error: failure === "enrolment" ? { message: "private SQL" } : null,
          };
          if (table === "daily_session_followup_entries" && state.operation === "update") return {
            data: entry, error: failure === "resolve" ? { message: "private SQL" } : null,
          };
          if (table === "daily_session_followup_entries") return {
            data: entry, error: failure === "replayRead" ? { message: "private SQL" } : null,
          };
          throw new Error("Unexpected maybeSingle " + table);
        },
        async single() {
          if (table !== "daily_session_followup_entries" || state.operation !== "insert") throw new Error("Unexpected single");
          return {
            data: entry,
            error: failure === "duplicate" || failure === "replayRead" ? { code: "23505", message: "private SQL" }
              : failure === "insert" ? { message: "private SQL" } : null,
          };
        },
        then(resolve, reject) {
          let result;
          if (table === "daily_attendance_slots") result = { data: [{ status: "closed" }], error: failure === "slots" ? { message: "private SQL" } : null };
          else if (table === "daily_attendance_records") result = { data: [{ status: "present" }], error: failure === "records" ? { message: "private SQL" } : null };
          else if (table === "daily_session_followup_entries" && state.count) result = {
            count: failure === "nullCount" ? null : 0,
            error: failure === "count" ? { message: "private SQL" } : null,
          };
          else if (table === "daily_session_followup_entries") result = {
            data: [entry], error: failure === "getEntries" ? { message: "private SQL" } : null,
          };
          else if (table === "daily_session_checklist_items" && state.operation === "update") result = {
            error: failure === "update" ? { message: "private SQL" } : null,
          };
          else throw new Error("Unexpected query " + table);
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const route = loadTypeScript("app/api/daily-portal/[token]/followup/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers ?? {} }) } },
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
    "@/lib/daily/portalAttendanceAccess.mjs": { isValidPortalExpiry },
  });
  const post = (extra = {}) => route.POST({
    json: async () => ({ request_id: requestId, entry_type: "incident", level: "attention", summary: "Incident", ...extra }),
  }, params);
  const patch = () => route.PATCH({ json: async () => ({ id: requestId, action_taken: "Action réalisée" }) }, params);
  return { route, post, patch, calls };
}

test("P0 suivi portail : refus du rôle non formateur avant les données privées", async () => {
  const f = fixture(null, "learner");
  const response = await f.route.GET({}, params);
  assert.equal(response.status, 403);
  assert.deepEqual(f.calls.map((call) => call.table), ["daily_portal_access_tokens"]);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
});

test("P0 suivi portail : GET et lectures d'autorisation masquent les erreurs SQL", async () => {
  for (const failure of ["access", "session", "getEntries"]) {
    const f = fixture(failure);
    const response = await f.route.GET({}, params);
    assert.equal(response.status, 503, failure);
    assert.doesNotMatch(JSON.stringify(response.body), /private SQL/);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
  }
});

test("P0 suivi portail : lecture partielle ne recalcule jamais une checklist", async () => {
  for (const failure of ["slots", "records", "count", "nullCount"]) {
    const f = fixture(failure);
    const response = await f.post();
    assert.equal(response.status, 201, failure);
    assert.equal(response.body.entry.id, requestId);
    assert.equal(response.body.checklist_synced, false);
    assert.match(response.body.warning, /tâches/);
    assert.equal(f.calls.filter((call) => call.table === "daily_session_checklist_items").length, 0);
    assert.doesNotMatch(JSON.stringify(response.body), /private SQL/);
  }
});

test("P0 suivi portail : écriture de checklist en panne garde la preuve et prévient", async () => {
  const f = fixture("update");
  const response = await f.post();
  assert.equal(response.status, 201);
  assert.equal(response.body.checklist_synced, false);
  assert.equal(f.calls.filter((call) => call.table === "daily_session_checklist_items").length, 1);
  assert.match(response.body.warning, /tâches/);
});

test("P0 suivi portail : checklist réussie avec isolation OF/session", async () => {
  const f = fixture();
  const response = await f.post();
  assert.equal(response.status, 201);
  assert.equal(response.body.checklist_synced, true);
  assert.equal(response.body.warning, undefined);
  const checklist = f.calls.find((call) => call.table === "daily_session_checklist_items");
  assert.ok(checklist);
  assert.ok(checklist.filters.some(([key, value]) => key === "organisation_id" && value === organisationId));
  assert.ok(checklist.filters.some(([key, value]) => key === "session_id" && value === sessionId));
  assert.ok(checklist.filters.some(([key, value]) => key === "item_key" && value === "attendance_followup"));
});

test("P0 suivi portail : rejeu idempotent retente la synchronisation des tâches", async () => {
  const f = fixture("duplicate");
  const response = await f.post();
  assert.equal(response.status, 200);
  assert.equal(response.body.replayed, true);
  assert.equal(response.body.checklist_synced, true);
  const replay = f.calls.find((call) => call.table === "daily_session_followup_entries" && call.filters.some(([key]) => key === "id"));
  assert.ok(replay.filters.some(([key, value]) => key === "organisation_id" && value === organisationId));
  assert.ok(replay.filters.some(([key, value]) => key === "session_id" && value === sessionId));
  assert.equal(f.calls.filter((call) => call.table === "daily_session_checklist_items").length, 1);
});

test("P0 suivi portail : rejeu non relisible refuse le faux succès", async () => {
  const f = fixture("replayRead");
  const response = await f.post();
  assert.equal(response.status, 503);
  assert.doesNotMatch(JSON.stringify(response.body), /private SQL/);
});

test("P0 suivi portail : résolution conserve la preuve si la checklist échoue", async () => {
  const f = fixture("records");
  const response = await f.patch();
  assert.equal(response.status, 200);
  assert.equal(response.body.entry.id, requestId);
  assert.equal(response.body.checklist_synced, false);
  assert.match(response.body.warning, /tâches/);
});

test("P0 suivi portail : erreurs SQL d'écriture et d'inscription ne sont pas divulguées", async () => {
  for (const failure of ["insert", "resolve", "enrolment"]) {
    const f = fixture(failure);
    const response = failure === "resolve" ? await f.patch()
      : await f.post(failure === "enrolment" ? { enrolment_id: "enrolment-1" } : {});
    assert.equal(response.status, 503, failure);
    assert.doesNotMatch(JSON.stringify(response.body), /private SQL/);
    assert.equal(f.calls.filter((call) => call.table === "daily_session_checklist_items").length, 0);
  }
});

test("P0 suivi portail : interface formateur affiche une synchronisation incomplète", () => {
  const source = fs.readFileSync("components/daily/DailyStakeholderWorkspace.tsx", "utf8");
  assert.match(source, /payload\.checklist_synced === false/);
  assert.match(source, /setFollowupError\(payload\.warning/);
});
