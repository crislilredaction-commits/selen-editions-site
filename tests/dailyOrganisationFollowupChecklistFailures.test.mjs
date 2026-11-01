import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const organisationId = "of-test";
const sessionId = "session-test";
const requestId = "123e4567-e89b-42d3-a456-426614174000";

function fixture(failure = null, forbidden = false) {
  const reads = [];
  const checklistUpdates = [];
  const writes = [];
  const admin = {
    from(table) {
      const state = { table, operation: "read", filters: [], count: false };
      const query = {
        select(_columns, options) { state.count = options?.count === "exact"; return this; },
        eq(key, value) { state.filters.push([key, value]); return this; },
        neq() { return this; },
        not() { return this; },
        order() { return this; },
        insert(payload) { state.operation = "insert"; writes.push({ table, payload }); return this; },
        update(payload) { state.operation = "update"; writes.push({ table, payload }); return this; },
        async single() {
          if (table !== "daily_session_followup_entries" || state.operation !== "insert") throw Error("Unexpected insert");
          return { data: failure === "insert" ? null : { id: requestId, status: "open" }, error: failure === "insert" ? { message: "private SQL insert" } : null };
        },
        async maybeSingle() {
          if (table === "daily_sessions") return { data: { id: sessionId }, error: null };
          if (table === "daily_session_followup_entries" && state.operation === "update") {
            return { data: failure === "resolve" ? null : { id: requestId, status: "resolved" }, error: failure === "resolve" ? { message: "private SQL update" } : null };
          }
          throw Error("Unexpected single " + table);
        },
        then(resolve, reject) {
          reads.push({ table, filters: [...state.filters] });
          let result;
          if (table === "daily_attendance_slots") result = { data: [{ status: "closed" }], error: failure === "slots" ? { message: "private SQL slots" } : null };
          else if (table === "daily_attendance_records") result = { data: [{ status: "present" }], error: failure === "records" ? { message: "private SQL records" } : null };
          else if (table === "daily_session_followup_entries") result = state.count
            ? { count: failure === "nullCount" ? null : 0, error: failure === "entries" ? { message: "private SQL entries" } : null }
            : { data: [{ id: requestId }], error: failure === "getEntries" ? { message: "private SQL entries" } : null };
          else if (table === "daily_session_enrolments") result = { data: [], error: failure === "getEnrolments" ? { message: "private SQL enrolments" } : null };
          else if (table === "daily_sessions") result = { data: [], error: failure === "getSessions" ? { message: "private SQL sessions" } : null };
          else if (table === "daily_session_checklist_items" && state.operation === "update") {
            checklistUpdates.push({ status: state.payload.status, filters: [...state.filters] });
            result = { error: failure === "update" ? { message: "private SQL checklist" } : null };
          } else throw Error("Unexpected query " + table);
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      Object.defineProperty(state, "payload", { get: () => writes.at(-1)?.payload });
      return query;
    },
  };
  const context = forbidden ? { ok: false, status: 403, error: "Accès refusé." } :
    { ok: true, admin, organisationId, capabilities: { sessions: true }, user: { id: "of-user" } };
  const route = loadTypeScript("app/api/client/daily/followup/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    "@/lib/server/agentAssistance": {
      blockedAgentAssistanceResponse: () => ({ status: 403 }),
      getAssistanceTokenFromRequest: () => null,
    },
    "@/lib/server/dailyOrganisationContext": {
      getDailyOrganisationContext: async () => context,
      getDailyOrganisationReadContext: async () => context,
    },
  });
  const post = (action = "create") => route.POST({ json: async () => ({
    action, session_id: sessionId, entry_type: "incident", request_id: requestId,
    summary: "Incident à suivre", id: requestId, action_taken: "Action réalisée",
  }) });
  const get = (id = sessionId) => route.GET({ url: "https://selen.example.test/api/client/daily/followup" + (id ? "?session_id=" + id : "") });
  return { post, get, reads, writes, checklistUpdates };
}

test("P0 OF : les pannes de lecture ne modifient jamais la checklist sur des données partielles", async () => {
  for (const failure of ["slots", "records", "entries", "nullCount"]) {
    const f = fixture(failure);
    const response = await f.post();
    assert.equal(response.status, 200, failure);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.checklist_synced, false);
    assert.match(response.body.warning, /suivi est enregistré/);
    assert.doesNotMatch(JSON.stringify(response.body), /private SQL/);
    assert.equal(f.writes.filter(w => w.table === "daily_session_followup_entries").length, 1);
    assert.equal(f.checklistUpdates.length, 0, failure);
    for (const read of f.reads) {
      assert.ok(read.filters.some(([key, value]) => key === "organisation_id" && value === organisationId));
      assert.ok(read.filters.some(([key, value]) => key === "session_id" && value === sessionId));
    }
  }
});

test("P0 OF : échec de mise à jour conserve le suivi et signale le décalage", async () => {
  const f = fixture("update");
  const response = await f.post();
  assert.equal(response.status, 200);
  assert.equal(response.body.checklist_synced, false);
  assert.match(response.body.warning, /tâches/);
  assert.equal(f.checklistUpdates.length, 1);
});

test("P0 OF : succès et résolution actualisent les tâches dans le bon OF", async () => {
  for (const action of ["create", "resolve"]) {
    const f = fixture();
    const response = await f.post(action);
    assert.equal(response.status, 200);
    assert.equal(response.body.checklist_synced, true);
    assert.equal(response.body.warning, undefined);
    assert.equal(f.checklistUpdates.length, 1);
    assert.equal(f.checklistUpdates[0].status, "to_review");
    for (const key of ["organisation_id", "session_id", "item_key"]) {
      assert.ok(f.checklistUpdates[0].filters.some(([k]) => k === key));
    }
  }
});

test("P0 OF : résolution métier conservée si la checklist ne peut pas être relue", async () => {
  const f = fixture("records");
  const response = await f.post("resolve");
  assert.equal(response.status, 200);
  assert.equal(response.body.checklist_synced, false);
  assert.equal(f.writes.filter(w => w.table === "daily_session_followup_entries").length, 1);
  assert.equal(f.checklistUpdates.length, 0);
});

test("P0 OF : les erreurs SQL des lectures et écritures ne sont pas exposées", async () => {
  for (const failure of ["getSessions", "getEntries", "getEnrolments", "insert", "resolve"]) {
    const f = fixture(failure);
    const response = failure === "getSessions" ? await f.get("") :
      failure === "getEntries" || failure === "getEnrolments" ? await f.get() :
      await f.post(failure === "resolve" ? "resolve" : "create");
    assert.equal(response.status, 500, failure);
    assert.match(response.body.error, /erreur technique/i);
    assert.doesNotMatch(JSON.stringify(response.body), /private SQL/);
    assert.equal(f.checklistUpdates.length, 0);
  }
});

test("P0 OF : refus des droits avant toute lecture et écriture", async () => {
  const f = fixture(null, true);
  assert.equal((await f.post()).status, 403);
  assert.equal((await f.get()).status, 403);
  assert.deepEqual(f.reads, []);
  assert.deepEqual(f.writes, []);
});
