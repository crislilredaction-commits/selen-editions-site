import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const completionRoute = await readFile(
  new URL("../app/api/client/daily/sessions/completion/route.ts", import.meta.url),
  "utf8",
);
const endEvaluationRoute = await readFile(
  new URL("../app/api/client/daily/end-evaluations/route.ts", import.meta.url),
  "utf8",
);

test("la complétude reconnaît une évaluation externe finalisée", () => {
  assert.match(completionRoute, /from\("daily_learning_assessments"\)\.select\("session_id,enrolment_id,outcome"\)/);
  assert.match(completionRoute, /row\.outcome && row\.outcome !== "pending"/);
  assert.match(completionRoute, /const hasRecordedAssessment = recordedAssessmentKeys\.has\(assessmentKey\)/);
  assert.match(completionRoute, /hasAssessmentEvidence \|\| hasAssessmentResponse \|\| hasRecordedAssessment/);
});

test("une évaluation encore pending ne compte pas comme terminée", () => {
  assert.match(completionRoute, /row\.outcome !== "pending"/);
});

test("le flux métier externe enregistre bien les résultats dans daily_learning_assessments", () => {
  assert.match(endEvaluationRoute, /from\("daily_learning_assessments"\)/);
  assert.match(endEvaluationRoute, /action === "save_assessment"/);
  assert.match(endEvaluationRoute, /outcome === "pending" \? null : now/);
});
