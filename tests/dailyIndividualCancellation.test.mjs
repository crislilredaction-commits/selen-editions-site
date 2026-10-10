import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cancellation = await readFile(new URL("../app/api/client/daily/enrolments/cancel/route.ts", import.meta.url), "utf8");
const abandonment = await readFile(new URL("../app/api/client/daily/enrolments/abandon/route.ts", import.meta.url), "utf8");
const learnerApi = await readFile(new URL("../app/api/client/daily/learners/route.ts", import.meta.url), "utf8");
const learnerPage = await readFile(new URL("../app/client/daily/apprenants/page.tsx", import.meta.url), "utf8");
const sessionsApi = await readFile(new URL("../app/api/client/daily/sessions/route.ts", import.meta.url), "utf8");

test("une désinscription est limitée à l'inscription et à l'organisme", () => {
  assert.match(cancellation, /eq\("id", enrolmentId\)/);
  assert.match(cancellation, /eq\("organisation_id", context\.organisationId\)/);
  assert.match(cancellation, /update\(\{ status: "cancelled"/);
  assert.doesNotMatch(cancellation, /\.delete\(\)/);
});

test("motif et date obligatoires, historique et révocation individuelle", () => {
  assert.match(cancellation, /!enrolmentId \|\| !reason \|\| !occurredAt/);
  assert.match(cancellation, /daily_session_followup_entries/);
  assert.match(cancellation, /description: reason/);
  assert.match(cancellation, /daily_portal_access_tokens/);
  assert.match(cancellation, /learner:\$\{enrolment\.learner_id\}/);
  assert.match(cancellation, /daily_attendance_access_tokens/);
  assert.match(cancellation, /eq\("enrolment_id", enrolmentId\)/);
});

test("abandon et annulation sont des procédures distinctes", () => {
  assert.match(learnerPage, /Déclarer un abandon en cours de formation/);
  assert.match(learnerPage, /Désinscrire avant formation/);
  assert.match(learnerPage, /\/api\/client\/daily\/enrolments\/abandon/);
  assert.match(abandonment, /confirmDailyEnrolmentAbandonment/);
  assert.match(learnerApi, /Utilisez la procédure de désinscription ou d’abandon/);
});

test("les effectifs des sessions excluent annulations et abandons", () => {
  assert.match(sessionsApi, /\(declined,cancelled,abandoned\)/);
});
