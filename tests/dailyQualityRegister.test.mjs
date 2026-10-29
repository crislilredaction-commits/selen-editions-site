import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";
const read=p=>fs.readFileSync(p,"utf8");

test("A3 utilise un registre unique incident difficulté réclamation",()=>{
 const page=read("app/client/daily/qualite/pilotage/page.tsx");
 assert.match(page,/Incidents, difficultés & réclamations/);
 assert.match(page,/\["incident","difficulty","complaint"\]/);
 assert.doesNotMatch(page,/id:"reclamations"/);
});

test("A3 migration conserve la table canonique et ajoute seulement les champs manquants",()=>{
 const migration=read("supabase/migrations/20260922120500_extend_daily_quality_register.sql");
 assert.match(migration,/alter table public\.daily_quality_actions/);
 assert.doesNotMatch(migration,/drop table|truncate|delete from/i);
 for(const field of ["event_date","event_source","responsible_name","corrective_action","corrective_action_date"]) assert.ok(migration.includes(field),field);
});

test("A3 est accessible via assistance Studio avec journalisation",()=>{
 const api=read("app/api/client/daily/quality-overview/route.ts");
 assert.match(api,/allowAssistanceWrite:true/);
 assert.match(api,/logAgentAssistanceAction/);
});

const clone = value => JSON.parse(JSON.stringify(value));
const fields = {
 category: "incident", title: "Incident initial", observation: "Constat terrain",
 event_date: "2026-09-30", event_source: "Formateur", responsible_name: "Responsable qualité",
 corrective_action: "Action corrective", corrective_action_date: "2026-10-01",
 proposed_solution: "Solution proposée", implemented_improvement: "Amélioration réalisée", status: "planned",
};

function harness() {
 const calls = [], logs = [], expectations = [];
 const admin = { from(table) {
  const expected = expectations.shift();
  assert.ok(expected, `Unexpected query: ${table}`);
  assert.equal(table, expected.table);
  let index = 0;
  const chain = {};
  for (const method of ["select", "eq", "in", "order", "limit", "insert", "update", "single", "maybeSingle"]) chain[method] = (...args) => {
   const step = expected.steps[index++];
   assert.ok(step, `Unexpected ${method} on ${table}`);
   assert.equal(method, step[0]);
   if (typeof step[1] === "function") step[1](...args);
   else assert.deepEqual(clone(args), step.slice(1));
   return chain;
  };
  chain.then = (resolve, reject) => Promise.resolve().then(() => {
   assert.equal(index, expected.steps.length, `Incomplete query: ${table}`);
   return { data: expected.data, error: null };
  }).then(resolve, reject);
  return chain;
 } };
 const context = { ok: true, admin, organisationId: "org-current", user: { id: "user-current" }, assisted: true, assistance: { id: "assistance-test" } };
 const route = loadTypeScript("app/api/client/daily/quality-overview/route.ts", {
  "next/server": { NextResponse: { json: (body, options) => ({ body: clone(body), status: options?.status ?? 200 }) } },
  "@/lib/server/dailyOrganisationContext": {
   getDailyOrganisationContext: async (req, scope, options) => { assert.equal(scope, "sessions"); assert.deepEqual(clone(options), { allowAssistanceWrite: true }); calls.push(req); return context; },
   getDailyOrganisationReadContext: async (req, scopes) => { assert.deepEqual(clone(scopes), ["trainings", "sessions"]); calls.push(req); return context; },
  },
  "@/lib/server/agentAssistance": { logAgentAssistanceAction: async entry => { assert.equal(entry.supabase, admin); assert.equal(entry.req, calls.at(-1)); assert.equal(entry.assistance, context.assistance); logs.push(entry); } },
 });
 return { route, logs, context, expect(table, steps, data) { expectations.push({ table, steps, data }); }, done() { assert.equal(expectations.length, 0); } };
}
const request = body => ({ url: "https://local.invalid/api/client/daily/quality-overview", json: async () => body });
const scoped = [["eq", "id", "entry-1"], ["eq", "organisation_id", "org-current"]];

test("A3 POST preserves business fields, organisation and assistance audit", async () => {
 const h = harness(); const saved = { ...fields, id: "entry-1", organisation_id: "org-current" };
 h.expect("daily_quality_actions", [["insert", payload => {
  for (const [key, value] of Object.entries(fields)) assert.equal(payload[key], value, key);
  assert.equal(payload.organisation_id, "org-current");
  assert.equal(payload.created_by, "user-current"); assert.equal(payload.updated_by, "user-current");
  assert.equal(payload.source_type, null); assert.equal(payload.source_id, null);
 }], ["select", "*"], ["single"]], saved);
 const result = await h.route.POST(request({ ...fields, organisation_id: "org-other" }));
 assert.equal(result.status, 201); assert.deepEqual(result.body.action, saved);
 assert.equal(h.logs.length, 1); assert.equal(h.logs[0].action, "daily_quality_register_create");
 assert.deepEqual(clone(h.logs[0].newState), saved); h.done();
});

test("A3 GET selects all business fields regardless of column order and scopes every read", async () => {
 const h = harness(); const saved = { ...fields, source_type: "quality_register", source_id: "origin-1" };
 h.expect("daily_sessions", [["select", "id"], ["eq", "organisation_id", "org-current"]], [{ id: "session-1" }]);
 for (const [table, order, limit] of [
  ["daily_learner_feedback_responses", "submitted_at", 100], ["daily_stakeholder_satisfaction_responses", "submitted_at", 100],
  ["daily_stakeholder_feedback", "created_at", 100], ["daily_quality_actions", "created_at", 150],
  ["daily_portal_access_tokens", "created_at", 150], ["daily_communications", "created_at", 500],
 ]) {
  const steps = [["select", columns => {
   assert.equal(typeof columns, "string");
   if (table === "daily_quality_actions") for (const field of [...Object.keys(fields), "source_type", "source_id"]) assert.ok(columns.split(",").includes(field), field);
  }]];
  if (table === "daily_portal_access_tokens") steps.push(["in", "session_id", ["session-1"]], ["in", "portal_type", ["enterprise", "trainer"]]);
  else steps.push(["eq", "organisation_id", "org-current"]);
  if (table === "daily_communications") steps.push(["eq", "communication_type", "stakeholder_satisfaction_request"], ["eq", "channel", "email"]);
  steps.push(["order", order, { ascending: table === "daily_communications" }], ["limit", limit]);
  h.expect(table, steps, table === "daily_quality_actions" ? [saved] : []);
 }
 const result = await h.route.GET(request());
 assert.equal(result.status, 200); assert.deepEqual(result.body.actions, [saved]); assert.equal(h.logs.length, 0); h.done();
});

for (const category of ["difficulty", "complaint", "corrective_action"]) test(`A3 PATCH edits and requalifies as ${category} with scoped audit`, async () => {
 const h = harness(); const old = { ...fields, id: "entry-1", source_type: "quality_register", source_id: "origin-1" };
 const edited = { ...fields, category, title: "Titre modifié", observation: "Constat modifié", event_source: "Client", responsible_name: "Autre responsable", corrective_action: "Nouvelle action", corrective_action_date: "2026-10-02", event_date: "2026-09-29" };
 h.expect("daily_quality_actions", [["select", "*"], ...scoped, ["maybeSingle"]], old);
 h.expect("daily_quality_actions", [["update", updates => {
  for (const [key, value] of Object.entries(edited)) assert.equal(updates[key], value, key);
  assert.equal(updates.source_type, old.source_type); assert.equal(updates.source_id, old.source_id);
  assert.equal(updates.updated_by, "user-current"); assert.ok(!Number.isNaN(Date.parse(updates.updated_at)));
 }], ...scoped, ["select", "*"], ["single"]], { ...old, ...edited });
 const result = await h.route.PATCH(request({ ...edited, id: "entry-1", organisation_id: "org-other" }));
 assert.equal(result.status, 200); assert.deepEqual(result.body.action, { ...old, ...edited });
 assert.equal(h.logs.length, 1); assert.equal(h.logs[0].action, "daily_quality_register_update");
 assert.deepEqual(clone(h.logs[0].oldState), old); assert.deepEqual(clone(h.logs[0].newState), result.body.action); h.done();
});

test("A3 rejects an entry outside the organisation without update or audit", async () => {
 const h = harness(); h.expect("daily_quality_actions", [["select", "*"], ...scoped, ["maybeSingle"]], null);
 assert.equal((await h.route.PATCH(request({ id: "entry-1", ...fields }))).status, 404);
 assert.equal(h.logs.length, 0); h.done();
});
