import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const organisationId = "of-test";
const sessionId = "session-test";
const requestId = "123e4567-e89b-42d3-a456-426614174000";

function fixture(failure = null) {
  const checklistUpdates = [];
  const created = [];
  const reads = [];
  const admin = {
    from(table) {
      const state = { table, operation: "read", filters: [] };
      const query = {
        select() { return this; },
        eq(key, value) { state.filters.push([key, value]); return this; },
        neq() { return this; },
        in() { return this; },
        insert(payload) { state.operation = "insert"; state.payload = payload; return this; },
        update(payload) { state.operation = "update"; state.payload = payload; return this; },
        async maybeSingle() {
          if (table === "daily_sessions") return { data: { id: sessionId, trainer_ids: ["trainer-test"] }, error: null };
          if (table === "daily_session_followup_entries" && state.operation === "update") {
            created.push({ resolved: true });
            return { data: { id: requestId, status: "resolved" }, error: null };
          }
          throw new Error("Lecture inattendue " + table);
        },
        async single() {
          if (table !== "daily_session_followup_entries" || state.operation !== "insert") throw new Error("Insertion inattendue");
          created.push(state.payload);
          return { data: { id: requestId, status: "open" }, error: null };
        },
        then(resolve, reject) {
          reads.push({ table, filters: [...state.filters] });
          let result;
          if (table === "daily_attendance_slots") result = { data: [{ status: "closed" }], error: failure === "slots" ? { message: "private SQL" } : null };
          else if (table === "daily_attendance_records") result = { data: [{ status: "present" }], error: failure === "records" ? { message: "private SQL" } : null };
          else if (table === "daily_session_followup_entries") result = { count: failure === "nullCount" ? null : 0, error: failure === "entries" ? { message: "private SQL" } : null };
          else if (table === "daily_session_checklist_items" && state.operation === "update") {
            checklistUpdates.push({ status: state.payload.status, filters: [...state.filters] });
            result = { error: failure === "update" ? { message: "private SQL" } : null };
          } else throw new Error("Requête inattendue " + table);
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const route = loadTypeScript("app/api/client/daily/trainer-followup/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    "@/lib/server/dailyTrainerWorkspaceContext": {
      getDailyTrainerWorkspaceContext: async () => ({
        ok: true, admin, user: { id: "trainer-user" },
        orgId: organisationId, trainerId: "trainer-test", trainerName: "Formateur test",
      }),
    },
  });
  const post = (action = "create", entryType = "incident") => route.POST({
    json: async () => ({
      action, entry_type: entryType, session_id: sessionId, request_id: requestId,
      summary: "Incident à suivre", level: "attention", id: requestId, action_taken: "Action réalisée",
    }),
  });
  return { post, checklistUpdates, created, reads };
}

test("P0 : une lecture SQL en panne ne recalcule pas une checklist sur des données vides", async () => {
  for (const failure of ["slots", "records", "entries", "nullCount"]) {
    const f = fixture(failure);
    const response = await f.post();
    assert.equal(response.status, 200, failure);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.checklist_synced, false);
    assert.match(response.body.warning, /suivi est enregistré/);
    assert.doesNotMatch(JSON.stringify(response.body), /private SQL/);
    assert.equal(f.created.length, 1);
    assert.equal(f.checklistUpdates.length, 0, failure);
    for (const read of f.reads) {
      assert.ok(read.filters.some(([key, value]) => key === "organisation_id" && value === organisationId));
      assert.ok(read.filters.some(([key, value]) => key === "session_id" && value === sessionId));
    }
  }
});

test("P0 : échec de mise à jour de checklist = suivi conservé, avertissement explicite", async () => {
  const f = fixture("update");
  const response = await f.post();
  assert.equal(response.status, 200);
  assert.equal(response.body.checklist_synced, false);
  assert.match(response.body.warning, /tâches/);
  assert.equal(f.created.length, 1);
  assert.equal(f.checklistUpdates.length, 1);
});

test("P0 : succès = checklist to_review bornée à l'OF et à la session", async () => {
  const f = fixture();
  const response = await f.post();
  assert.equal(response.status, 200);
  assert.equal(response.body.checklist_synced, true);
  assert.equal(response.body.warning, undefined);
  assert.equal(f.checklistUpdates.length, 1);
  assert.equal(f.checklistUpdates[0].status, "to_review");
  assert.ok(f.checklistUpdates[0].filters.some(([key, value]) => key === "organisation_id" && value === organisationId));
  assert.ok(f.checklistUpdates[0].filters.some(([key, value]) => key === "session_id" && value === sessionId));
});

test("P0 : la clôture métier reste enregistrée si le rafraîchissement échoue", async () => {
  const f = fixture("records");
  const response = await f.post("resolve");
  assert.equal(response.status, 200);
  assert.equal(response.body.checklist_synced, false);
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].resolved, true);
  assert.equal(f.checklistUpdates.length, 0);
});

test("P0 : une simple note ne déclenche pas de calcul de checklist", async () => {
  const f = fixture("slots");
  const response = await f.post("create", "note");
  assert.equal(response.status, 200);
  assert.equal(response.body.checklist_synced, true);
  assert.equal(f.reads.length, 0);
  assert.equal(f.checklistUpdates.length, 0);
});
