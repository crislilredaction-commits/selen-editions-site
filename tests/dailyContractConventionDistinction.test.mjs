import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modelsPage = await readFile(new URL("../app/client/daily/modeles-documents/page.tsx", import.meta.url), "utf8");
const contractModel = await readFile(new URL("../app/client/daily/modeles-documents/contrat-formation/page.tsx", import.meta.url), "utf8");
const generatorLayout = await readFile(new URL("../app/client/daily/generateur-documents/layout.tsx", import.meta.url), "utf8");
const legacyContractGenerator = await readFile(new URL("../app/client/daily/generateur-documents/contrat-formation/page.tsx", import.meta.url), "utf8");
const generator = await readFile(new URL("../app/client/daily/generateur-documents/page.tsx", import.meta.url), "utf8");

test("Daily conserve convention et contrat comme modèles documentaires distincts", () => {
  assert.match(modelsPage, /name: "Convention de formation"/);
  assert.match(modelsPage, /name: "Contrat de formation professionnelle"/);
  assert.match(modelsPage, /type: "training_agreement"/);
  assert.match(modelsPage, /type: "training_contract"/);
  assert.match(contractModel, /DOCUMENT_TYPE = "training_contract"/);
  assert.match(contractModel, /personne physique.*titre individuel.*à ses frais/s);
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

test("le contrat généré conserve les protections essentielles du stagiaire individuel", () => {
  assert.match(generator, /délai légal de rétractation/);
  assert.match(generator, /Aucun paiement ne peut être exigé avant son expiration/);
  assert.match(generator, /Force majeure/);
});
