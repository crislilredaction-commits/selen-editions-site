import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modelsLayout = await readFile(new URL("../app/client/daily/modeles-documents/layout.tsx", import.meta.url), "utf8");
const contractModel = await readFile(new URL("../app/client/daily/modeles-documents/contrat-formation/page.tsx", import.meta.url), "utf8");
const generatorLayout = await readFile(new URL("../app/client/daily/generateur-documents/layout.tsx", import.meta.url), "utf8");
const contractGenerator = await readFile(new URL("../app/client/daily/generateur-documents/contrat-formation/page.tsx", import.meta.url), "utf8");
const legacyGenerator = await readFile(new URL("../app/client/daily/generateur-documents/page.tsx", import.meta.url), "utf8");

test("Daily distingue explicitement convention et contrat dans les modèles", () => {
  assert.match(modelsLayout, /Convention de formation professionnelle/);
  assert.match(modelsLayout, /Contrat de formation professionnelle/);
  assert.match(contractModel, /DOCUMENT_TYPE = "training_contract"/);
  assert.match(contractModel, /personne physique.*titre individuel.*à ses frais/s);
});

test("le générateur conserve la convention et expose un parcours contrat séparé", () => {
  assert.match(legacyGenerator, /makeConvention/);
  assert.match(legacyGenerator, /Convention_Formation\.pdf/);
  assert.match(generatorLayout, /générateur-documents\/contrat-formation|generateur-documents\/contrat-formation/);
  assert.match(contractGenerator, /CONTRAT DE FORMATION PROFESSIONNELLE/);
  assert.match(contractGenerator, /délai légal de rétractation|délai légal.*rétractation/s);
});

test("le contrat exige les conditions financières propres au stagiaire individuel", () => {
  assert.match(contractGenerator, /name="payment" required/);
  assert.match(contractGenerator, /name="early" required/);
  assert.match(contractGenerator, /Cessation anticipée \/ abandon/);
  assert.match(contractGenerator, /Aucun paiement n'est exigible avant son expiration/);
});
