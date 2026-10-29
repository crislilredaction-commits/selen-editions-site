import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const learner = await readFile(new URL("../app/api/internal/daily/satisfaction-automation/route.ts", import.meta.url), "utf8");
const stakeholder = await readFile(new URL("../app/api/internal/daily/stakeholder-satisfaction-automation/route.ts", import.meta.url), "utf8");
const cronRoute = await readFile(new URL("../app/api/cron/daily-satisfaction/route.ts", import.meta.url), "utf8");
const vercelConfig = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const endEvaluations = await readFile(new URL("../lib/server/dailyEndEvaluations.ts", import.meta.url), "utf8");
const uniquenessMigration = await readFile(new URL("../supabase/migrations/20261008073500_daily_satisfaction_active_followup_uniqueness.sql", import.meta.url), "utf8");
const inactiveCleanupMigration = await readFile(new URL("../supabase/migrations/20261011211500_daily_satisfaction_inactive_enrolment_cleanup.sql", import.meta.url), "utf8");

for (const [label, source] of [["apprenants", learner], ["parties prenantes", stakeholder]]) {
  test(`${label}: deux relances seulement à J+2 et J+4`, () => {
    assert.match(source, /REMINDER_OFFSETS_DAYS = \[2, 4\] as const/);
    assert.doesNotMatch(source, /REMINDER_INTERVAL_DAYS = 3|REMINDER_DAYS = 3/);
    assert.match(source, /automation_stage/);
  });
}
test("parties prenantes: une réponse stoppe les emails et aucune tâche téléphone n'est imposée au client", () => {
  assert.match(stakeholder, /already_submitted/);
  assert.doesNotMatch(stakeholder, /satisfaction_phone_followup|Relance téléphonique satisfaction|Contacter la partie prenante par téléphone/);
});
test("apprenants: le suivi téléphonique existant reste inchangé hors périmètre A5", () => {
  assert.match(learner, /satisfaction_phone_followup/);
  assert.match(learner, /phoneActionBySource/);
});

test("la satisfaction entreprise démarre à J+15 puis conserve les relances J+2/J+4", () => {
  assert.match(stakeholder, /ENTERPRISE_INITIAL_OFFSET_DAYS = 15/);
  assert.match(stakeholder, /initialOffsetForPortal/);
  assert.match(stakeholder, /ageDaysSinceAvailability = ageDays - initialOffsetForPortal\(portal\)/);
  assert.match(stakeholder, /stageDue\(ageDaysSinceAvailability, stages\)/);
});

test("les inscriptions abandonnées sont exclues des relances de satisfaction", () => {
  assert.match(endEvaluations, /status !== "cancelled" && status !== "declined" && status !== "abandoned"/);
  assert.match(learner, /activeDailyEnrolment\(row\.status\)/);
});

test("les sessions annulées sont exclues et la tâche téléphone résiste aux retries concurrents", () => {
  assert.match(learner, /\.not\("status", "in", "\(archived,cancelled\)"\)/);
  assert.match(learner, /error\.code !== "23505"/);
  assert.match(uniquenessMigration, /create unique index if not exists daily_quality_actions_active_satisfaction_phone_unique/);
  assert.match(uniquenessMigration, /source_type = 'satisfaction_phone_followup'/);
  assert.match(uniquenessMigration, /status in \('open', 'planned'\)/);
});

test("une inscription devenue inactive clôt la relance téléphone et révoque son jeton sans supprimer l’historique", () => {
  assert.match(inactiveCleanupMigration, /after update of status or delete on public\.daily_session_enrolments/);
  assert.match(inactiveCleanupMigration, /new\.status in \('cancelled', 'declined', 'abandoned'\)/);
  assert.match(inactiveCleanupMigration, /source_type = 'satisfaction_phone_followup'/);
  assert.match(inactiveCleanupMigration, /status = 'closed'/);
  assert.match(inactiveCleanupMigration, /daily_learner_feedback_tokens/);
  assert.match(inactiveCleanupMigration, /status = 'revoked'/);
  assert.match(inactiveCleanupMigration, /set search_path = ''/);
  assert.match(inactiveCleanupMigration, /organisation_id = v_organisation_id/);
  assert.match(inactiveCleanupMigration, /session_id = v_session_id/);
  assert.match(inactiveCleanupMigration, /not exists[\s\S]*daily_session_enrolments/);
  assert.doesNotMatch(inactiveCleanupMigration, /delete from/i);
});

test("Vercel déclenche quotidiennement le lot satisfaction complet", () => {
  assert.deepEqual(vercelConfig.crons, [{
    path: "/api/cron/daily-satisfaction",
    schedule: "0 7 * * *",
  }, {
    path: "/api/cron/daily-agent-task-notifications",
    schedule: "0 8 * * *",
  }]);
  assert.match(cronRoute, /runLearnerSatisfactionAutomation/);
  assert.match(cronRoute, /runStakeholderSatisfactionAutomation/);
  assert.match(cronRoute, /url\.search = "\?execute=1"/);
});

test("le cron exige CRON_SECRET et relaie le secret uniquement aux automations internes", () => {
  assert.match(cronRoute, /process\.env\.CRON_SECRET/);
  assert.match(cronRoute, /authorization.*Bearer \$\{secret\}/s);
  assert.match(cronRoute, /process\.env\.DAILY_AUTOMATION_SECRET = secret/);
  assert.doesNotMatch(cronRoute, /x-vercel-cron-schedule/);
});
