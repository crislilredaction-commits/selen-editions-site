import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indicators = await readFile(new URL("../lib/server/dailyTrainingIndicators.ts", import.meta.url), "utf8");
const evaluationsPage = await readFile(new URL("../app/client/daily/evaluations/page.tsx", import.meta.url), "utf8");
const evaluationRoute = await readFile(new URL("../app/api/client/daily/end-evaluations/route.ts", import.meta.url), "utf8");

test("résultats pédagogiques: seul Acquis compte comme réussite", () => {
  assert.match(indicators, /row\.outcome === "achieved"/);
  assert.match(indicators, /successful_assessments/);
  assert.match(indicators, /success_rate: percent\(successfulAssessmentIds\.size, completedAssessmentIds\.size\)/);
  assert.match(indicators, /success_rate: percent\(item\.successful_assessments, item\.assessments_completed\)/);
});

test("résultats pédagogiques: le code historique reste compatible sans migration destructive", () => {
  assert.match(evaluationRoute, /"partially_achieved"/);
  assert.match(evaluationsPage, /value="partially_achieved"/);
});
