import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const learner = await readFile(new URL("../app/api/internal/daily/satisfaction-automation/route.ts", import.meta.url), "utf8");
const stakeholder = await readFile(new URL("../app/api/internal/daily/stakeholder-satisfaction-automation/route.ts", import.meta.url), "utf8");
const cronRoute = await readFile(new URL("../app/api/cron/daily-satisfaction/route.ts", import.meta.url), "utf8");
const vercelConfig = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const endEvaluations = await readFile(new URL("../lib/server/dailyEndEvaluations.ts", import.meta.url), "utf8");

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

test("Vercel déclenche quotidiennement le lot satisfaction complet", () => {
  assert.deepEqual(vercelConfig.crons, [{
    path: "/api/cron/daily-satisfaction",
    schedule: "0 7 * * *",
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
