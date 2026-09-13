import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modelsPage = await readFile(new URL("../app/client/daily/modeles-documents/page.tsx", import.meta.url), "utf8");
const legacyContractModel = await readFile(new URL("../app/client/daily/modeles-documents/contrat-formation/page.tsx", import.meta.url), "utf8");
const generatorLayout = await readFile(new URL("../app/client/daily/generateur-documents/layout.tsx", import.meta.url), "utf8");
const legacyContractGenerator = await readFile(new URL("../app/client/daily/generateur-documents/contrat-formation/page.tsx", import.meta.url), "utf8");
const generator = await readFile(new URL("../app/client/daily/generateur-documents/page.tsx", import.meta.url), "utf8");

test("Daily conserve convention et contrat comme modèles documentaires distincts dans la liste générale", () => {
  assert.match(modelsPage, /name: "Convention de formation"/);
  assert.match(modelsPage, /name: "Contrat de formation professionnelle"/);
  assert.match(modelsPage, /type: "training_agreement"/);
  assert.match(modelsPage, /type: "training_contract"/);
  assert.match(modelsPage, /personne physique entreprenant la formation à titre individuel et à ses frais/);
  assert.match(legacyContractModel, /redirect\("\/client\/daily\/modeles-documents"\)/);
});

test("le générateur n'expose plus de parcours contrat autonome", () => {
  assert.doesNotMatch(generatorLayout, /générateur-documents\/contrat-formation|generateur-documents\/contrat-formation/);
  assert.match(legacyContractGenerator, /redirect\("\/client\/daily\/generateur-documents"\)/);
});

test("le générateur choisit contrat ou convention depuis le SIRET client final", () => {
  assert.match(generator, /clientSiret/);
  assert.match(generator, /makeConvention/);
  assert.match(generator, /makeContract/);
  assert.match(generator, /SIRET client/);
  assert.match(generator, /Contrat de formation professionnelle/);
  assert.match(generator, /Convention de formation/);
});

test("le SIRET client doit être vide ou contenir exactement 14 chiffres", () => {
  assert.match(generator, /rawClientSiret/);
  assert.match(generator, /rawClientSiret\.replace\(\/\\s\+\/g,""\)/);
  assert.match(generator, /\^\\d\{14\}\$/);
  assert.match(generator, /Le SIRET du client doit comporter exactement 14 chiffres/);
  assert.match(generator, /SIRET valide \(14 chiffres\) : convention\. Champ vide : contrat\./);
});

test("le programme généré reprend les indicateurs de performance de la formation", () => {
  assert.match(generator, /result_beneficiary_count/);
  assert.match(generator, /result_satisfaction_rate/);
  assert.match(generator, /result_success_rate/);
  assert.match(generator, /results_pending/);
  assert.match(generator, /Indicateurs de performance/);
});

test("le contrat généré conserve les protections essentielles du stagiaire individuel", () => {
  assert.match(generator, /délai légal de rétractation/);
  assert.match(generator, /Aucun paiement ne peut être exigé avant son expiration/);
  assert.match(generator, /Force majeure/);
});

test("le programme et le livret couvrent inscription, accès, contact et accessibilité", () => {
  assert.match(generator, /Modalités d'inscription/);
  assert.match(generator, /Délai d'accès/);
  assert.match(generator, /Accessibilité \/ handicap/);
  assert.match(generator, /function learnerContact/);
  assert.match(generator, /function accessibilityInfo/);
  assert.match(generator, /Bienvenue/);
});

test("le dossier génère un règlement intérieur et une politique PSH dédiés", () => {
  assert.match(generator, /function makeInternalRules/);
  assert.match(generator, /04_Reglement_Interieur\.pdf/);
  assert.match(generator, /Assiduité et horaires/);
  assert.match(generator, /Santé et sécurité/);
  assert.match(generator, /function makePshPolicy/);
  assert.match(generator, /05_Politique_Accueil_PSH\.pdf/);
  assert.match(generator, /Adaptations possibles/);
  assert.match(generator, /Contact accessibilité/);
});

test("la synthèse du générateur annonce les nouveaux documents du dossier", () => {
  assert.match(generator, /règlement intérieur/);
  assert.match(generator, /politique d’accueil et d’accessibilité PSH/);
  assert.match(generator, /Programme complet avec inscription, délai d’accès, indicateurs, accessibilité et positionnement/);
});
