import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const routePath = "app/api/client/daily/trainer-session-workspace/attendance-sheet/route.ts";
const next = { NextResponse: class extends Response { static json(body, options) { return Response.json(body, options); } } };
const request = (id = "session-a") => new Request(`https://daily.example.test/api/client/daily/trainer-session-workspace/attendance-sheet?session_id=${id}`);

function fixture({ contextError, assigned = true, slotsError = null, enrolmentsError = null, slots, enrolments } = {}) {
  const calls = [];
  const context = contextError || { ok: true, orgId: "of-a", trainerId: "trainer-a", trainerName: "Formateur <A>", admin: null };
  const session = { id: "session-a", internal_reference: "Session <A>", daily_formations: { title: "Formation <A>" } };
  const slotRows = slots ?? [
    { id: "slot-active", slot_date: "2026-11-01", starts_at: "09:00:00", ends_at: "12:00:00", label: "Matin <1>", status: "open", organisation_id: "of-a", session_id: "session-a" },
    { id: "slot-cancelled", slot_date: "2026-11-01", starts_at: "13:00:00", ends_at: "16:00:00", label: "Annulé", status: "cancelled", organisation_id: "of-a", session_id: "session-a" },
    { id: "slot-foreign", slot_date: "2026-11-02", starts_at: "09:00:00", ends_at: "12:00:00", label: "Autre OF", status: "open", organisation_id: "of-b", session_id: "session-a" },
  ];
  const learnerRows = enrolments ?? [
    { id: "active", status: "confirmed", organisation_id: "of-a", session_id: "session-a", daily_learners: { first_name: "Léa <", last_name: "Active" } },
    { id: "completed", status: "completed", organisation_id: "of-a", session_id: "session-a", daily_learners: { first_name: "Louis", last_name: "Terminé" } },
    ...["cancelled", "declined", "abandoned"].map(status => ({ id: status, status, organisation_id: "of-a", session_id: "session-a", daily_learners: { first_name: status, last_name: "Retiré" } })),
    { id: "foreign", status: "confirmed", organisation_id: "of-b", session_id: "session-a", daily_learners: { first_name: "Autre", last_name: "OF" } },
  ];
  const admin = { from(table) {
    const filters = [];
    const query = {
      select() { return this; },
      eq(column, value) { filters.push(row => row[column] === value); calls.push([table, "eq", column, value]); return this; },
      neq(column, value) { filters.push(row => row[column] !== value); calls.push([table, "neq", column, value]); return this; },
      not(column, operator, value) { assert.equal(operator, "in"); const blocked = value.slice(1, -1).split(","); filters.push(row => !blocked.includes(row[column])); calls.push([table, "not", column, value]); return this; },
      order() { return this; },
      then(resolve, reject) { const error = table === "daily_attendance_slots" ? slotsError : enrolmentsError; const rows = table === "daily_attendance_slots" ? slotRows : learnerRows; return Promise.resolve({ data: error ? null : rows.filter(row => filters.every(fn => fn(row))), error }).then(resolve, reject); },
    };
    return query;
  } };
  if (context.ok) context.admin = admin;
  let assignedChecks = 0;
  const route = loadTypeScript(routePath, {
    "next/server": next,
    "@/lib/server/dailyTrainerWorkspaceContext": {
      getDailyTrainerWorkspaceContext: async () => context,
      getAssignedDailyTrainerSession: async (ctx, id) => { assignedChecks++; assert.equal(ctx, context); return assigned && id === "session-a" ? session : null; },
    },
  }, { Request, Response, URL });
  return { route, calls, get assignedChecks() { return assignedChecks; } };
}

test("la feuille utilise l'identité personnelle : compte non autorisé et adresse ambiguë refusés", async () => {
  for (const status of [403, 409]) {
    const f = fixture({ contextError: { ok: false, status, error: "Accès refusé" } });
    assert.equal((await f.route.GET(request())).status, status);
    assert.equal(f.assignedChecks, 0);
    assert.deepEqual(f.calls, []);
  }
});

test("une session non affectée ou absente ne révèle aucun nom d'apprenant", async () => {
  const f = fixture({ assigned: false });
  const response = await f.route.GET(request());
  assert.equal(response.status, 404);
  assert.deepEqual(f.calls, []);
  assert.doesNotMatch(await response.text(), /Léa|Louis/);
});

test("le téléchargement exclut les abandons, refus, annulations et créneaux annulés, et isole l'OF", async () => {
  const f = fixture();
  const response = await f.route.GET(request());
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /Léa &lt; Active/);
  assert.match(body, /Louis Terminé/);
  assert.match(body, /Matin &lt;1&gt;/);
  assert.doesNotMatch(body, /cancelled|declined|abandoned|Autre OF|Annulé/);
  assert.doesNotMatch(body, /<A>|Matin <1>|Léa </);
  for (const table of ["daily_attendance_slots", "daily_session_enrolments"]) {
    assert.ok(f.calls.some(call => call[0] === table && call[1] === "eq" && call[2] === "organisation_id" && call[3] === "of-a"));
    assert.ok(f.calls.some(call => call[0] === table && call[1] === "eq" && call[2] === "session_id" && call[3] === "session-a"));
  }
  assert.ok(f.calls.some(call => call[0] === "daily_attendance_slots" && call[1] === "neq" && call[2] === "status" && call[3] === "cancelled"));
  assert.ok(f.calls.some(call => call[0] === "daily_session_enrolments" && call[1] === "not" && call[3].includes("abandoned")));
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(response.headers.get("Content-Disposition"), /attachment/);
});

test("une erreur SQL ne renvoie jamais de feuille partielle", async () => {
  for (const failure of [{ slotsError: { message: "slots failed" } }, { enrolmentsError: { message: "learners failed" } }]) {
    const f = fixture(failure);
    const response = await f.route.GET(request());
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /Léa|Formateur|Formation/);
  }
});

test("aucun créneau actif ou apprenant ne produit une feuille vide", async () => {
  for (const empty of [{ slots: [] }, { enrolments: [] }]) {
    const f = fixture(empty);
    assert.equal((await f.route.GET(request())).status, 409);
  }
});

test("session_id manquant est refusé avant toute lecture métier", async () => {
  const f = fixture();
  assert.equal((await f.route.GET(request(""))).status, 400);
  assert.equal(f.assignedChecks, 0);
  assert.deepEqual(f.calls, []);
});
