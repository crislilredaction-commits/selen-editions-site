import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [home, sessionPage, route, signer, migration] = await Promise.all([
  readFile(new URL("../app/client/daily/formateur/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/client/daily/formateur/suivi-sessions/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/client/daily/trainer-session-workspace/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/server/dailyTrainerPersonalSignature.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261014012515_daily_trainer_personal_signature.sql", import.meta.url), "utf8"),
]);

test("l’accueil formateur expose directement l’émargement personnel sans l’ajouter au mode assistance", () => {
  const personalHome = home.slice(home.indexOf("return ("));
  assert.match(personalHome, /Signer ma présence \/ émargement/);
  assert.match(personalHome, /suivi-sessions#signer-ma-presence/);
  assert.match(personalHome, /uniquement votre propre présence/);
  const assistanceHome = home.slice(home.indexOf("if \(assistedTrainers\)"), home.indexOf("return ("));
  assert.doesNotMatch(assistanceHome, /Signer ma présence \/ émargement/);
});

test("la session place l’action avant les autres outils et rend les erreurs explicites", () => {
  assert.ok(sessionPage.indexOf('id="signer-ma-presence"') < sessionPage.indexOf("Ressource, feuille papier ou évaluation externe"));
  assert.match(sessionPage, /Signer ma présence \/ émargement/);
  assert.match(sessionPage, /role="alert" style=\{styles\.error\}>\{signatureError\}/);
  assert.match(sessionPage, /role="status" style=\{styles\.success\}>\{signatureMessage\}/);
  assert.match(sessionPage, /Confirmez votre consentement/);
  assert.match(sessionPage, /horodatage réel/);
});

test("la signature reste bornée côté serveur au compte, au formateur, à la session et au créneau affectés", () => {
  assert.match(route, /getDailyTrainerWorkspaceContext/);
  assert.match(route, /recordDailyTrainerPersonalSignature/);
  assert.match(signer, /getAssignedDailyTrainerSession/);
  assert.match(signer, /x-selen-agent-assistance/);
  assert.match(signer, /context\.trainerId/);
  assert.match(signer, /daily_record_trainer_presence_signature/);
  assert.match(migration, /p_actor_user_id/);
  assert.match(migration, /p_trainer_id/);
  assert.match(migration, /p_session_id/);
  assert.match(migration, /p_slot_id/);
  assert.match(migration, /revoke all on function public\.daily_record_trainer_presence_signature[\s\S]*from public,\s*anon,\s*authenticated/i);
  assert.match(migration, /grant execute on function public\.daily_record_trainer_presence_signature[\s\S]*to service_role/i);
});

test("changer de session annule les anciennes lectures et réinitialise les données apprenants", () => {
  assert.match(sessionPage, /activeSessionIdRef\.current = sessionId/);
  assert.match(sessionPage, /signal\?\.aborted \|\| activeSessionIdRef\.current !== id/);
  assert.match(sessionPage, /const controller = new AbortController\(\)/);
  assert.match(sessionPage, /loadSession\(sessionId, controller\.signal\)/);
  assert.match(sessionPage, /return \(\) => controller\.abort\(\)/);
  assert.match(sessionPage, /setEntries\(\[\]\);\s*setEnrolments\(\[\]\);\s*setSupportNeeds\(\[\]\);\s*setEnrolmentId\(""\)/);
  assert.match(sessionPage, /<TrainerPedagogicalTools key=\{sessionId\}/);
});
