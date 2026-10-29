import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "./dailyTrainerInvitationAccess.test.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("le suivi annuel et ses téléversements refusent une fiche formateur désactivée", async () => {
  const sources = await Promise.all([
    read("app/api/client/daily/trainer-annual-review/route.ts"),
    read("app/api/client/daily/trainer-annual-review/cv/route.ts"),
    read("app/api/client/daily/trainer-annual-review/attestation/route.ts"),
  ]);

  for (const source of sources) {
    assert.match(source, /\.eq\("user_id", userId\)[\s\S]*?\.eq\("active", true\)[\s\S]*?\.limit\(2\)/);
    assert.match(source, /\.ilike\("professional_email", normalizedEmail\)[\s\S]*?\.eq\("active", true\)[\s\S]*?\.limit\(2\)/);
  }
});

test("le suivi de session exige la fiche formateur liée au compte connecté", async () => {
  const source = await read("app/api/client/daily/trainer-followup/route.ts");

  assert.match(source, /workspace\.workspace\.trainers\.find\(\(item\) => String\(item\.user_id \?\? ""\) === workspace\.user\.id\)/);
  assert.doesNotMatch(source, /workspace\.workspace\.trainers\[0\]/);
  assert.match(source, /if \(!trainer\?\.id\) \{[\s\S]*?status: 404[\s\S]*?Fiche formateur introuvable\./);
});

test("un dirigeant n'obtient l'espace formateur que s'il possède réellement une fiche ou un rôle formateur", async () => {
  const source = await read("app/api/client/daily/trainer-followup/route.ts");

  assert.match(source, /const hasTrainerAccess = workspace\.workspace\.capabilities\.trainer_self[\s\S]*?workspace\.workspace\.membership\.roles\.includes\("trainer"\)[\s\S]*?Boolean\(trainer\)/);
  assert.match(source, /if \(!hasTrainerAccess\) \{[\s\S]*?status: 403[\s\S]*?réservé au formateur concerné/);
  assert.doesNotMatch(source, /membership\.roles\.includes\("owner"\)/);
  assert.doesNotMatch(source, /membership\.roles\.includes\("admin"\)/);
});

test("les sessions visibles restent limitées au profil formateur assigné", async () => {
  const source = await read("app/api/client/daily/trainer-followup/route.ts");

  assert.match(source, /const sessions = \(data \?\? \[\]\)\.filter\(\(session\) => trainerIds\(session\.trainer_ids\)\.includes\(context\.trainerProfileId\)\)/);
  assert.match(source, /if \(!data \|\| !trainerIds\(data\.trainer_ids\)\.includes\(trainerProfileId\)\) return null/);
});

test("le suivi formateur utilise la colonne Supabase viewed_at sans recréer last_viewed_at", async () => {
  const source = await read("app/api/client/daily/trainer-followup/route.ts");

  assert.match(source, /daily_portal_access_tokens[\s\S]*?expires_at,viewed_at/);
  assert.doesNotMatch(source, /last_viewed_at/);
  assert.match(source, /\.eq\("portal_type", "learner"\)/);
});
