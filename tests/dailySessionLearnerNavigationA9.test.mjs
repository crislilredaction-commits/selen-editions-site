import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sessions = read("components/daily/DailySessionsManager.tsx");
const trainerRoute = read("app/api/client/daily/trainer-followup/route.ts");
const trainerPage = read("app/client/daily/formateur/suivi-sessions/page.tsx");

test("A9: la session OF ouvre la fiche de l'apprenant", () => {
  assert.match(sessions, /Apprenants de la session · fiches et preuves/);
  assert.match(sessions, /\/client\/daily\/apprenants\?learner=/);
});

test("A9: le formateur ne lit que les inscrits de son organisation et de sa session affectée", () => {
  assert.match(trainerRoute, /getAssignedSession\(context\.admin, context\.organisationId, context\.trainerProfileId, sessionId\)/);
  assert.match(trainerRoute, /daily_session_enrolments[\s\S]*\.eq\("organisation_id", context\.organisationId\)\.eq\("session_id", sessionId\)/);
  assert.match(trainerRoute, /daily_enrolment_support_needs[\s\S]*\.eq\("organisation_id", context\.organisationId\)\.in\("enrolment_id", enrolmentIds\)/);
  assert.doesNotMatch(trainerRoute, /service_role.*client/i);
});

test("A9: la fiche formateur reste en lecture seule et navigable", () => {
  assert.match(trainerPage, /Apprenants de la session/);
  assert.match(trainerPage, /Fiches en lecture seule, limitées à vos sessions affectées/);
  assert.match(trainerPage, /requestedEnrolmentId/);
  assert.match(trainerPage, /Ouvrir cette fiche apprenant/);
  assert.match(trainerPage, /Positionnement/);
  assert.match(trainerPage, /Prérequis/);
});
