import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const trainerRecords = fs.readFileSync("app/api/client/daily/trainer-records/route.ts", "utf8");
const trainerPage = fs.readFileSync("app/client/daily/formateurs/page.tsx", "utf8");
const trainerSelf = fs.readFileSync("app/client/daily/formateur/page.tsx", "utf8");
const learnerRoute = fs.readFileSync("app/api/client/daily/learners/route.ts", "utf8");
const learnerPage = fs.readFileSync("app/client/daily/apprenants/page.tsx", "utf8");
const reminderRoute = fs.readFileSync("app/api/internal/daily/trainer-annual-reminders/route.ts", "utf8");

test("la fiche formateur regroupe sessions missions CV et contrats", () => {
  assert.match(trainerRecords, /daily_sessions/);
  assert.match(trainerRecords, /daily_mission_orders/);
  assert.match(trainerRecords, /trainer_contract/);
  assert.match(trainerRecords, /trainer_cv/);
  assert.match(trainerPage, /Historique des sessions/);
  assert.match(trainerPage, /Ordres de mission/);
  assert.match(trainerPage, /Importer un contrat PDF/);
});

test("le formateur peut renseigner librement ses compétences", () => {
  assert.match(trainerSelf, /Compétences \/ spécialités/);
  assert.match(trainerSelf, /Expression libre/);
  assert.match(trainerSelf, /Présentation \/ expérience/);
});

test("le dirigeant-formateur est exclu du moteur d’auto-évaluation", () => {
  assert.match(reminderRoute, /\.neq\("engagement_type", "owner"\)/);
  assert.match(trainerPage, /aucune auto-évaluation annuelle ni relance/);
});

test("le dossier apprenant conserve notes et chronologie documentaire", () => {
  assert.match(learnerRoute, /daily_session_followup_entries/);
  assert.match(learnerRoute, /action==="note"/);
  assert.match(learnerRoute, /daily_documents/);
  assert.match(learnerPage, /Documents reçus et signés/);
  assert.match(learnerPage, /Ajouter la note/);
  assert.match(learnerPage, /Préparer et envoyer le dossier d'inscription/);
});
