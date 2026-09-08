import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pretraining = fs.readFileSync("lib/server/dailyPretrainingDocumentHtml.ts", "utf8");
const procedures = fs.readFileSync("app/client/daily/procedures/page.tsx", "utf8");

test("les documents administratifs préformation portent le pied de page légal", () => {
  assert.match(pretraining, /organisationName/);
  assert.match(pretraining, /organisationAddress/);
  assert.match(pretraining, /organisationSiret/);
  assert.match(pretraining, /organisationNda/);
  assert.match(pretraining, /organisationPhone/);
  assert.match(pretraining, /organisationEmail/);
  assert.match(pretraining, /Cette déclaration ne vaut pas agrément de l'État/);
});

test("les procédures Word portent le même socle d'identification", () => {
  assert.match(procedures, /SIRET/);
  assert.match(procedures, /NDA/);
  assert.match(procedures, /Cette déclaration ne vaut pas agrément de l'État/);
  assert.match(procedures, /administrative_phone/);
  assert.match(procedures, /administrative_email/);
  assert.match(procedures, /text-align:justify/);
});
