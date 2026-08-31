import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/server/dailyTrainingIndicators.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/client/daily/indicators/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/client/daily/indicateurs/page.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/client/daily/layout.tsx", import.meta.url), "utf8");

test("indicateurs formation: réutilisent uniquement les sources Daily existantes et restent cloisonnés par organisme", () => {
  for (const table of ["daily_sessions", "daily_session_enrolments", "daily_learning_assessments", "daily_learner_feedback_responses", "daily_session_followup_entries"]) {
    assert.match(source, new RegExp(`from\\(\\"${table}\\"\\)`));
  }
  assert.match(source, /\.eq\("organisation_id", organisationId\)/);
  assert.match(source, /status !== "archived" && status !== "cancelled"/);
  assert.match(source, /Boolean\(endDate\).*String\(endDate\) <= today/);
  assert.match(source, /status !== "cancelled" && status !== "declined"/);
  assert.match(source, /completedByFormation/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("API indicateurs: conserve le contexte authentifié Daily et ne met pas les résultats en cache public", () => {
  assert.match(route, /getDailyOrganisationReadContext\(request, \["sessions"\]\)/);
  assert.match(route, /loadDailyTrainingIndicators\(context\.admin, context\.organisationId\)/);
  assert.match(route, /Cache-Control": "private, no-store"/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("écran indicateurs: fonctionne aussi en assistance et garde le vouvoiement Daily", () => {
  assert.match(page, /assistanceFetch\("\/api\/client\/daily\/indicators"/);
  assert.match(page, /Vos indicateurs de formation/);
  assert.match(page, /Vous n’avez pas accès/);
  assert.doesNotMatch(page, /\btu\b|\bton\b|\btes\b/i);
  assert.match(layout, /\/client\/daily\/indicateurs/);
  assert.match(layout, /Indicateurs formation/);
});
