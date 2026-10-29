import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("AP2 conserve le détail apprenant et consolide les vraies sources post-formation", async () => {
  const source = await read("lib/server/dailySessionFollowupSummary.ts");
  for (const table of ["daily_learning_assessments", "daily_learner_feedback_responses", "daily_session_followup_entries", "daily_posttraining_analyses"]) {
    assert.match(source, new RegExp(`from\\("${table}"\\)`));
  }
  assert.match(source, /details: learnerDetails/);
  assert.match(source, /strengths: uniqueText/);
  assert.match(source, /weaknesses: uniqueText/);
  assert.match(source, /vigilance: uniqueText/);
  assert.match(source, /action_required/);
  assert.match(source, /activeIds\.has\(row\.enrolment_id\)/);
});

test("AP2 alimente la fiche écran et PDF avec agrégats et détail", async () => {
  const [component, pdf] = await Promise.all([
    read("components/daily/DailySessionFollowupSummary.tsx"),
    read("app/api/client/daily/followup-summary/pdf/route.ts"),
  ]);
  for (const expected of ["Synthèse post-formation", "Points forts", "Points faibles / difficultés", "Vigilances", "Une action humaine reste nécessaire"]) {
    assert.match(component, new RegExp(expected));
  }
  assert.match(component, /posttraining\.details\.map/);
  assert.match(pdf, /summary\.posttraining\.details/);
  assert.match(pdf, /Vigilances avec action/);
});

test("AP2 expose les taux de réponse et de complétude calculés, sans compteur parallèle", async () => {
  const [source, page] = await Promise.all([
    read("lib/server/dailyTrainingIndicators.ts"),
    read("app/client/daily/indicateurs/page.tsx"),
  ]);
  assert.match(source, /satisfaction_response_rate: percent/);
  assert.match(source, /assessment_completion_rate: percent/);
  assert.match(page, /satisfaction_response_rate/);
  assert.match(page, /assessment_completion_rate/);
  assert.doesNotMatch(source, /\.insert\(|\.upsert\(|\.update\(/);
});

test("le schéma AP2 impose le périmètre, l'unicité et les RLS", async () => {
  const migration = await read("supabase/migrations/20261008131200_daily_posttraining_analysis.sql");
  assert.match(migration, /unique \(organisation_id, session_id, enrolment_id\)/);
  assert.match(migration, /daily_posttraining_analysis_scope_guard/);
  assert.match(migration, /enrolment\.organisation_id = new\.organisation_id/);
  assert.match(migration, /enrolment\.session_id = new\.session_id/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /daily_is_selen_staff\(\)/);
  assert.match(migration, /can_manage_daily_sessions\(organisation_id\)/);
});
