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

test("le suivi de session partage le résolveur canonique de l'identité formateur", async () => {
  const source = await read("app/api/client/daily/trainer-followup/route.ts");
  const resolver = await read("lib/server/dailyTrainerWorkspaceContext.ts");
  assert.match(source, /getDailyTrainerWorkspaceContext\(\)/);
  assert.doesNotMatch(source, /workspace\.workspace\.trainers\.find|normalizedEmail/);
  assert.match(resolver, /linked\.length>1\|\|\(!linked\.length&&emailMatches\.length>1\)/);
  assert.match(resolver, /!item\.user_id/);
  assert.match(resolver, /item\.active!==false&&item\.status!=="archived"/);
});

test("un dirigeant n'obtient le suivi formateur qu'avec une fiche personnelle admissible", async () => {
  const source = await read("app/api/client/daily/trainer-followup/route.ts");
  const resolver = await read("lib/server/dailyTrainerWorkspaceContext.ts");
  assert.match(source, /if \(!context\.ok\) return context/);
  assert.match(resolver, /membership\.roles\.includes\("manager"\)/);
  assert.match(resolver, /engagement_type==="owner"&&\(!item\.user_id\|\|String\(item\.user_id\)===workspace\.user\.id\)/);
  assert.doesNotMatch(source, /membership\.roles\.includes\("owner"\)|membership\.roles\.includes\("admin"\)/);
});

test("les sessions visibles restent limitées au profil formateur assigné", async () => {
  const source = await read("app/api/client/daily/trainer-followup/route.ts");

  assert.match(source, /const sessions = \(data \?\? \[\]\)\.filter\(\(session\) => trainerIds\(session\.trainer_ids\)\.includes\(context\.trainerProfileId\)\)/);
  assert.match(source, /if \(!data \|\| !trainerIds\(data\.trainer_ids\)\.includes\(trainerProfileId\)\) return null/);
});

test("le suivi formateur ne lit pas les jetons ponctuels des apprenants", async () => {
  const source = await read("app/api/client/daily/trainer-followup/route.ts");

  assert.doesNotMatch(source, /daily_portal_access_tokens|portalAccess|viewed_at|last_viewed_at/);
  assert.match(source, /getAssignedSession\(context\.admin, context\.organisationId, context\.trainerProfileId, sessionId\)/);
});
