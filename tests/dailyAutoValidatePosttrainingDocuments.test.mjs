import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260914134123_auto_validate_ready_posttraining_documents.sql",
  import.meta.url,
);
const migration = await readFile(migrationPath, "utf8");

test("les documents de fin ne sont validés automatiquement qu'après la fin réelle de session", () => {
  assert.match(migration, /v_session_end is null or v_session_end > current_date/);
  assert.match(migration, /s\.status <> 'closed'/);
  assert.match(migration, /r\.status <> 'pending'/);
});

test("les inscriptions inactives restent exclues de la validation automatique", () => {
  assert.match(migration, /e\.status not in \('declined', 'cancelled', 'abandoned'\)/);
});

test("un certificat exige une présence réelle et une évaluation finale", () => {
  assert.match(migration, /r\.status = 'present'/);
  assert.match(migration, /a\.outcome is not null/);
  assert.match(migration, /a\.outcome <> 'pending'/);
});

test("la validation automatique ne cible que les documents générés par Daily", () => {
  assert.match(migration, /generated_by/);
  assert.match(migration, /daily_posttraining/);
  assert.match(migration, /new\.status := 'validated'/);
});

test("la fonction de trigger n'est pas exposée aux rôles client", () => {
  assert.match(
    migration,
    /revoke all on function public\.daily_auto_validate_posttraining_document\(\) from public, anon, authenticated;/,
  );
});
