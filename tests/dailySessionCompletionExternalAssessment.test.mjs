import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const completionRoute = await readFile(
  new URL("../app/api/client/daily/sessions/completion/route.ts", import.meta.url),
  "utf8",
);
const completionHelper = await readFile(
  new URL("../lib/server/dailySessionCompletion.ts", import.meta.url),
  "utf8",
);
const endEvaluationRoute = await readFile(
  new URL("../app/api/client/daily/end-evaluations/route.ts", import.meta.url),
  "utf8",
);
const dossierRoute = await readFile(
  new URL("../app/api/client/daily/session-dossiers/route.ts", import.meta.url),
  "utf8",
);

test("la complétude reconnaît une évaluation externe finalisée", () => {
  assert.match(completionRoute, /from\("daily_learning_assessments"\)\.select\("session_id,enrolment_id,outcome"\)/);
  assert.match(completionHelper, /row\.outcome && row\.outcome !== "pending"/);
  assert.match(completionHelper, /const hasRecordedAssessment = recordedAssessmentKeys\.has\(assessmentKey\)/);
  assert.match(completionHelper, /hasAssessmentEvidence \|\| hasAssessmentResponse \|\| hasRecordedAssessment/);
});

test("une évaluation encore pending ne compte pas comme terminée", () => {
  assert.match(completionHelper, /row\.outcome !== "pending"/);
});

test("un positionnement relu compte comme terminé", () => {
  assert.match(completionHelper, /DONE_POSITIONING_STATUSES = new Set\(\["reviewed", "completed", "validated", "done"\]\)/);
});

test("les tâches internes Selen ne bloquent pas la complétude client", () => {
  assert.match(completionRoute, /neq\("responsibility", "selen"\)/);
  assert.match(completionHelper, /item\.responsibility !== "selen"/);
});

test("la clôture attend la fin de session et une complétude réelle à 100 pour cent", () => {
  assert.match(completionHelper, /endDate && endDate <= today/);
  assert.match(completionHelper, /stats\.expected > 0/);
  assert.match(completionHelper, /stats\.completed === stats\.expected/);
});

test("la clôture persiste completed et completed_at uniquement depuis active", () => {
  assert.match(completionHelper, /currentStatus !== "active"/);
  assert.match(completionHelper, /update\(\{ status: "completed", completed_at: stamp, updated_at: stamp \}\)/);
  assert.match(completionHelper, /eq\("status", "active"\)/);
});

test("la validation d'un point de dossier relance immédiatement la réconciliation", () => {
  assert.match(dossierRoute, /select\("id,session_id,responsibility"\)/);
  assert.match(dossierRoute, /status === "validated"/);
  assert.match(dossierRoute, /reconcileDailySessionDossier\(/);
});

test("le flux métier externe enregistre bien les résultats dans daily_learning_assessments", () => {
  assert.match(endEvaluationRoute, /from\("daily_learning_assessments"\)/);
  assert.match(endEvaluationRoute, /action === "save_assessment"/);
  assert.match(endEvaluationRoute, /outcome === "pending" \? null : now/);
});
