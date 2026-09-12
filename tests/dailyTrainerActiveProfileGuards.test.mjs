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
