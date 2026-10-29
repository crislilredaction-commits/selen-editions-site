import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const organisation = await readFile(new URL("../app/api/client/daily/followup/route.ts", import.meta.url), "utf8");
const trainer = await readFile(new URL("../app/api/client/daily/trainer-followup/route.ts", import.meta.url), "utf8");
const trainerPortal = await readFile(new URL("../app/api/daily-portal/[token]/followup/route.ts", import.meta.url), "utf8");
const organisationFollowupPage = await readFile(new URL("../app/client/daily/suivi/page.tsx", import.meta.url), "utf8");
const trainerFollowupPage = await readFile(new URL("../app/client/daily/formateur/suivi-sessions/page.tsx", import.meta.url), "utf8");
const summaryRoute = await readFile(new URL("../app/api/client/daily/followup-summary/route.ts", import.meta.url), "utf8");
const summarySource = await readFile(new URL("../lib/server/dailySessionFollowupSummary.ts", import.meta.url), "utf8");
const summaryPdfRoute = await readFile(new URL("../app/api/client/daily/followup-summary/pdf/route.ts", import.meta.url), "utf8");
const summaryComponent = await readFile(new URL("../components/daily/DailySessionFollowupSummary.tsx", import.meta.url), "utf8");

test("suivi organisme: l’auteur vient de l’utilisateur authentifié et est relu", () => {
  assert.match(organisation, /author_role: "Organisme de formation"/);
  assert.match(organisation, /author_name: organisationAuthorName\(context\.user\)/);
  assert.match(organisation, /author_role,author_name/);
  assert.doesNotMatch(organisation, /text\(body, "author_(?:role|name)"\)/);
});

test("suivi formateur authentifié: l’auteur vient de la fiche formateur", () => {
  assert.match(trainer, /trainerName: String\(trainer\.display_name/);
  assert.match(trainer, /author_role: "Formateur"/);
  assert.match(trainer, /author_name: context\.trainerName/);
  assert.match(trainer, /author_role,author_name/);
  assert.doesNotMatch(trainer, /text\(body, "author_(?:role|name)"\)/);
});

test("suivi portail formateur: l’identité vient du jeton et non du corps de requête", () => {
  assert.match(trainerPortal, /entity_name,entity_email/);
  assert.match(trainerPortal, /author_role: "Formateur"/);
  assert.match(trainerPortal, /author_name: authorName/);
  assert.match(trainerPortal, /author_role,author_name/);
  assert.doesNotMatch(trainerPortal, /text\(body\.author_(?:role|name)\)/);
});

test("historique organisme: affiche l’auteur et conserve un repli pour les anciennes lignes", () => {
  assert.match(organisationFollowupPage, /author_role\?: string \| null/);
  assert.match(organisationFollowupPage, /author_name\?: string \| null/);
  assert.match(organisationFollowupPage, /Ajouté par :/);
  assert.match(organisationFollowupPage, /Auteur non renseigné \(historique antérieur\)/);
  assert.match(organisationFollowupPage, /entry\.author_role/);
});

test("historique formateur: affiche la même provenance sans masquer les anciennes lignes", () => {
  assert.match(trainerFollowupPage, /author_role\?: string \| null/);
  assert.match(trainerFollowupPage, /author_name\?: string \| null/);
  assert.match(trainerFollowupPage, /Ajouté par :/);
  assert.match(trainerFollowupPage, /Auteur non renseigné \(historique antérieur\)/);
  assert.match(trainerFollowupPage, /entry\.author_role/);
});

test("écrans de suivi Daily: les consignes utilisent le vouvoiement", () => {
  assert.match(organisationFollowupPage, /Consignez uniquement les événements utiles au dossier/);
  assert.doesNotMatch(organisationFollowupPage, /\bConsigne uniquement\b/);
  assert.match(trainerFollowupPage, /Consignez une note utile au suivi ou signalez un incident/);
  assert.doesNotMatch(trainerFollowupPage, /\bConsigne une note\b/);
});

test("récapitulatif session: agrège uniquement les sources Daily existantes et reste cloisonné par organisme", () => {
  assert.match(summaryRoute, /getDailyOrganisationReadContext\(request, \["sessions"\]\)/);
  assert.match(summaryRoute, /loadDailySessionFollowupSnapshot\(context\.admin, context\.organisationId, sessionId\)/);
  for (const table of ["daily_sessions", "organisations", "daily_session_enrolments", "daily_attendance_records", "daily_learning_assessments", "daily_learner_feedback_responses", "daily_session_followup_entries"]) {
    assert.match(summarySource, new RegExp(`from\\(\\"${table}\\"\\)`));
  }
  assert.match(summarySource, /\.eq\("organisation_id", organisationId\)/);
  assert.match(summarySource, /row\.status !== "pending"/);
  assert.match(summarySource, /row\.outcome !== "pending"/);
  assert.doesNotMatch(summarySource, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("récapitulatif session: la page affiche les indicateurs sans créer une nouvelle source de vérité", () => {
  assert.match(organisationFollowupPage, /DailySessionFollowupSummary sessionId=\{sessionId\}/);
  assert.match(summaryComponent, /Récapitulatif de la session/);
  assert.match(summaryComponent, /Apprenants actifs/);
  assert.match(summaryComponent, /Émargements renseignés/);
  assert.match(summaryComponent, /Évaluations finales/);
  assert.match(summaryComponent, /Satisfaction apprenants/);
  assert.match(summaryComponent, /Suivis ouverts/);
  assert.match(summaryComponent, /Ils ne créent aucune donnée parallèle/);
});

test("fiche PDF: réutilise le snapshot authentifié, reste en lecture seule et expose un vrai PDF", () => {
  assert.match(summaryPdfRoute, /getDailyOrganisationReadContext\(request, \["sessions"\]\)/);
  assert.match(summaryPdfRoute, /loadDailySessionFollowupSnapshot\(context\.admin, context\.organisationId, sessionId\)/);
  assert.match(summaryPdfRoute, /new jsPDF/);
  assert.match(summaryPdfRoute, /Content-Type": "application\/pdf"/);
  assert.match(summaryPdfRoute, /Cache-Control": "private, no-store"/);
  assert.match(summaryPdfRoute, /author_name/);
  assert.match(summaryPdfRoute, /learner_name/);
  assert.doesNotMatch(summaryPdfRoute, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("fiche PDF: le téléchargement passe par assistanceFetch pour conserver le contexte d’assistance", () => {
  assert.match(summaryComponent, /followup-summary\/pdf\?session_id=/);
  assert.match(summaryComponent, /assistanceFetch/);
  assert.match(summaryComponent, /Télécharger la fiche PDF/);
  assert.match(summaryComponent, /response\.blob\(\)/);
});
