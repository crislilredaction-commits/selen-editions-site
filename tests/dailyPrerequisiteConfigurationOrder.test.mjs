import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manager = await readFile(new URL("../components/daily/DailyFormationsManager.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261009140651_daily_optional_prerequisite_evidence.sql", import.meta.url), "utf8");

test("la configuration des justificatifs suit le positionnement et précède l’évaluation finale", () => {
  const positioning = manager.indexOf('<SectionTitle title="Test de positionnement"');
  const prerequisites = manager.indexOf('<SectionTitle title="Justificatifs des prérequis"');
  const assessment = manager.indexOf('<SectionTitle title="Évaluation finale des acquis"');
  assert.ok(positioning >= 0 && positioning < prerequisites && prerequisites < assessment);
  assert.match(manager, /checked=\{requirement\.required !== false\}/);
  assert.match(manager, /seules les pièces obligatoires bloquent l’admission/);
});

test("la migration additive ignore l’absence facultative et ne remplace que les pièces refusées", () => {
  assert.match(migration, /requirement_required := coalesce\(\(requirement->>'required'\)::boolean, true\)/);
  assert.match(migration, /requirement_required and matching_count <> 1/);
  assert.match(migration, /and e\.status = 'rejected' for update/);
  assert.match(migration, /where coalesce\(\(value->>'required'\)::boolean, true\)/);
  assert.match(migration, /revoke all on function public\.replace_daily_prerequisite_evidence_submission/);
});
