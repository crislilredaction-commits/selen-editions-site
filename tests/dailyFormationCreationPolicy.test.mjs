import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("lib/dailyFormationCreationPolicy.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260919161000_p0d_formation_creation_prerequisites.sql", "utf8");

test("P0-D distinguishes program import from Selen form", () => {
  assert.match(source, /program_import/);
  assert.match(source, /selen_form/);
  assert.match(source, /parseDailyFormationCreationMode/);
});

test("program import requires the original document but not descriptive re-entry", () => {
  assert.match(source, /PROGRAM_IMPORT_REQUIRED_COMPLEMENTS/);
  assert.match(source, /detailedProgramDocumentUrl/);
  assert.match(source, /Importez le programme original/);
  const importBlock = source.match(/const PROGRAM_IMPORT_REQUIRED_COMPLEMENTS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  assert.doesNotMatch(importBlock, /global_objective/);
  assert.doesNotMatch(importBlock, /target_audience/);
  assert.doesNotMatch(importBlock, /pedagogical_resources/);
  assert.doesNotMatch(importBlock, /evaluation_methods/);
});

test("Selen form keeps structured descriptive fields and objectives", () => {
  const formBlock = source.match(/const SELEN_FORM_REQUIRED_FIELDS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  assert.match(formBlock, /global_objective/);
  assert.match(formBlock, /target_audience/);
  assert.match(formBlock, /pedagogical_resources/);
  assert.match(formBlock, /evaluation_methods/);
  assert.match(source, /requiresStructuredLearningObjectives/);
  assert.match(source, /mode === "selen_form"/);
});

test("prerequisites are deliberately outside descriptive required fields", () => {
  assert.doesNotMatch(source.match(/const SELEN_FORM_REQUIRED_FIELDS = \[([\s\S]*?)\] as const;/)?.[1] ?? "", /prerequisites/);
  assert.doesNotMatch(source.match(/const PROGRAM_IMPORT_REQUIRED_COMPLEMENTS = \[([\s\S]*?)\] as const;/)?.[1] ?? "", /prerequisites/);
});

test("P0-D persists creation mode and an explicit prerequisite declaration", () => {
  assert.match(migration, /add column if not exists creation_mode text not null default 'selen_form'/);
  assert.match(migration, /add column if not exists prerequisite_mode text not null default 'none'/);
  assert.match(migration, /add column if not exists prerequisite_requirements jsonb not null default '\[\]'::jsonb/);
  assert.match(migration, /program_import/);
  assert.match(migration, /selen_form/);
  assert.match(migration, /prerequisite_mode = 'required'/);
  assert.match(migration, /jsonb_array_length\(prerequisite_requirements\) > 0/);
});
