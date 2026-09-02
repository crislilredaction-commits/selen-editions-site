import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indicators = await readFile(new URL("../lib/server/dailyTrainingIndicators.ts", import.meta.url), "utf8");
const evaluationsPage = await readFile(new URL("../app/client/daily/evaluations/page.tsx", import.meta.url), "utf8");
const evaluationRoute = await readFile(new URL("../app/api/client/daily/end-evaluations/route.ts", import.meta.url), "utf8");
const posttrainingRoute = await readFile(new URL("../app/api/client/daily/posttraining-documents/route.ts", import.meta.url), "utf8");
const posttrainingHtml = await readFile(new URL("../lib/server/dailyPosttrainingDocumentHtml.ts", import.meta.url), "utf8");

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

test("résultats pédagogiques: le libellé métier remplace Partiellement acquis", () => {
  assert.match(evaluationsPage, /value="partially_achieved">En cours d’acquisition<\/option>/);
  assert.doesNotMatch(evaluationsPage, />Partiellement acquis<\/option>/);
});

test("certificat de réalisation: l’évaluation finale est chargée et tracée", () => {
  assert.match(posttrainingRoute, /from\("daily_learning_assessments"\)/);
  assert.match(posttrainingRoute, /learning_outcome:learningOutcome/);
  assert.match(posttrainingRoute, /learning_result:learningResult/);
  assert.match(posttrainingRoute, /learning_assessed_at:assessment\?\.assessed_at\?\?null/);
});

test("certificat de réalisation: Acquis et Non acquis suivent la sémantique métier", () => {
  assert.match(posttrainingHtml, /outcome === "achieved"\) return "Acquis"/);
  assert.match(posttrainingHtml, /outcome === "partially_achieved" \|\| outcome === "not_achieved"\) return "Non acquis"/);
  assert.match(posttrainingHtml, /Résultat de l’évaluation des acquis/);
  assert.match(posttrainingHtml, /if \(outcome === "achieved"\)/);
  assert.match(posttrainingHtml, /return null/);
});
