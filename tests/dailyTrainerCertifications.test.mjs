import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const api = await readFile(new URL("../app/api/client/daily/trainer-certifications/route.ts", import.meta.url), "utf8");
const proofApi = await readFile(new URL("../app/api/client/daily/trainer-certifications/proof/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/client/daily/formateur/certifications/page.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260830041034_allow_trainers_to_add_certification_proofs.sql", import.meta.url), "utf8");

test("l’API rattache toujours les certifications à la fiche du formateur authentifié", () => {
  assert.match(api, /trainer_profile_id: context\.trainer\.id/);
  assert.match(api, /\.eq\("trainer_profile_id", context\.trainer\.id\)/);
  assert.match(api, /roles\.includes\("trainer"\)/);
  assert.doesNotMatch(api, /export async function DELETE/);
});

test("le justificatif est borné à une certification appartenant au même formateur", () => {
  assert.match(proofApi, /\.eq\("id", certificationId\)/);
  assert.match(proofApi, /\.eq\("trainer_profile_id", trainerProfileId\)/);
  assert.match(proofApi, /linked_object_type: "trainer_certification"/);
  assert.match(proofApi, /document_purpose: "qualification"/);
  assert.match(proofApi, /application\/pdf/);
  assert.match(proofApi, /image\/jpeg/);
  assert.match(proofApi, /MAX_FILE_SIZE = 10 \* 1024 \* 1024/);
});

test("l’espace formateur permet modifier et joindre une preuve sans proposer de suppression", () => {
  assert.match(page, /Mes certifications/);
  assert.match(page, /Modifier/);
  assert.match(page, /Ajouter un justificatif/);
  assert.match(page, /Remplacer le justificatif/);
  assert.doesNotMatch(page, />Supprimer</);
});

test("la défense RLS des preuves reste strictement liée au formateur connecté", () => {
  assert.match(migration, /trainer\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /linked_object_type = 'trainer_certification'/);
  assert.match(migration, /document_type = 'trainer_qualification_proof'/);
  assert.match(migration, /document_purpose = 'qualification'/);
});
