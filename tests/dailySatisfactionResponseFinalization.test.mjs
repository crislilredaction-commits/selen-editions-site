import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const learner = await readFile(new URL("../app/api/daily-feedback/[token]/route.ts", import.meta.url), "utf8");
const stakeholder = await readFile(new URL("../app/api/daily-portal/[token]/satisfaction/route.ts", import.meta.url), "utf8");
const portalLearner = await readFile(new URL("../app/api/daily-portal/[token]/learner-satisfaction/route.ts", import.meta.url), "utf8");
const lifecycle = await readFile(new URL("../lib/server/dailyLearnerSatisfactionLifecycle.ts", import.meta.url), "utf8");

test("le formateur peut répondre le dernier jour et l’entreprise à J+15", () => {
  assert.match(stakeholder, /function availabilityOffsetForPortal\(portalType: SupportedPortalType\) \{\s*return portalType === "enterprise" \? 15 : 0;/);
  assert.match(stakeholder, /questionnaire entreprise sera disponible 15 jours après la fin/);
  assert.match(stakeholder, /questionnaire formateur sera disponible le dernier jour/);
});

test("une réponse apprenant ferme immédiatement sa relance téléphonique", () => {
  assert.match(learner, /finalizeDailyLearnerSatisfaction/);
  assert.match(portalLearner, /finalizeDailyLearnerSatisfaction/);
  assert.match(lifecycle, /source_type", PHONE_FOLLOWUP_SOURCE/);
  assert.match(lifecycle, /source_id", input\.enrolmentId/);
  assert.match(lifecycle, /status: "closed"/);
  assert.match(lifecycle, /daily_learner_feedback_tokens/);
  assert.match(lifecycle, /status: "submitted"/);
  assert.match(learner, /if \(existing\)[\s\S]*finalizeDailyLearnerSatisfaction/);
  assert.match(portalLearner, /if \(resolved\.feedback\)[\s\S]*finalizeDailyLearnerSatisfaction/);
});

test("le questionnaire apprenant refuse les inscriptions annulées, refusées ou abandonnées", () => {
  assert.match(learner, /activeDailyEnrolment/);
  assert.match(learner, /if \(!session \|\| !enrolment \|\| !activeDailyEnrolment\(enrolment\.status\)\)/);
  assert.match(learner, /if \(!enrolment \|\| !activeDailyEnrolment\(enrolment\.status\)\)/);
  assert.match(learner, /\(cancelled,declined,abandoned\)/);
});

test("une réponse formateur ou entreprise ferme immédiatement sa relance téléphonique", () => {
  assert.match(stakeholder, /source_type", PHONE_FOLLOWUP_SOURCE/);
  assert.match(stakeholder, /source_id", portal\.access\.id/);
  assert.match(stakeholder, /status: "closed"/);
});
