import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const context = await readFile(new URL("../lib/server/dailyTrainerWorkspaceContext.ts", import.meta.url), "utf8");

test("le dirigeant retrouve son profil formateur owner sans ouvrir l'accès aux autres formateurs", () => {
  assert.match(context, /membership\.roles\.includes\("manager"\)/);
  assert.match(context, /item\.engagement_type==="owner"/);
  assert.match(context, /owners\.length===1/);
  assert.match(context, /trainerId:String\(resolvedTrainer\.id\)/);
  assert.match(context, /ids\(data\.trainer_ids\)\.includes\(context\.trainerId\)/);
});
