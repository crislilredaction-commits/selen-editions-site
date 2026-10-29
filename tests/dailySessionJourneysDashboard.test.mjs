import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/client/daily/action-center/route.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../components/daily/DailyDashboardOverviewV2.tsx", import.meta.url), "utf8");

test("the OF dashboard journey stays scoped to the authenticated organisation", () => {
  assert.match(route, /getDailyOrganisationReadContext\(req,\["sessions","trainings"\]\)/);
  assert.match(route, /daily_session_checklist_items[\s\S]*?eq\("organisation_id",context\.organisationId\)/);
  assert.match(route, /daily_session_enrolments[\s\S]*?eq\("organisation_id",context\.organisationId\)/);
});

test("session cards use canonical enrolments, checklist states and responsibilities", () => {
  assert.match(route, /not\("status","in","\(cancelled,declined,abandoned\)"\)/);
  assert.match(route, /if\(enrolment.status==="completed"\)continue/);
  assert.match(route, /const enrolmentCounts=new Map/);
  assert.match(route, /const checklistBySession=new Map/);
  assert.match(route, /actorLabel/);
  assert.match(route, /"not_applicable"/);
  assert.match(route, /state:completed\?"completed":current\?"current":"upcoming"/);
  assert.match(route, /return NextResponse\.json\(\{actions,sessionJourneys,counts:/);
});

test("session cards are collapsed, keep completed steps visible and lock future steps", () => {
  assert.doesNotMatch(dashboard, /<SessionJourneys journeys=\{journeys\}/);
  assert.doesNotMatch(dashboard, /<details key=\{journey\.id\} open/);
  assert.match(dashboard, /step\.state==="completed"\?"line-through":""/);
  assert.match(dashboard, /"À venir 🔒"/);
  assert.match(dashboard, /journey\.learnerCount/);
  assert.match(dashboard, /step\.actor/);
});

test("only active actions are presented under their source session", () => {
  assert.match(dashboard, /actions\.filter\(item=>item\.sessionId===journey\.id\)/);
  assert.doesNotMatch(route, /actions\.push\(\{id:`dossier:\$\{item\.id\}`/);
  assert.match(dashboard, /Aucune action active pour votre organisme/);
});
