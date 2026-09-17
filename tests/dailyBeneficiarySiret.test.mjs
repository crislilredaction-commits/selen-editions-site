import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helper = await readFile(new URL("../lib/dailyBeneficiarySiret.ts", import.meta.url), "utf8");
const registrationPage = await readFile(new URL("../app/daily-inscription/[token]/page.tsx", import.meta.url), "utf8");
const registrationRoute = await readFile(new URL("../app/api/daily-registration/[token]/route.ts", import.meta.url), "utf8");
const beneficiarySiretFields = await readFile(new URL("../components/daily/BeneficiaryProfessionalSiretFields.tsx", import.meta.url), "utf8");

test("le SIRET bénéficiaire est une donnée distincte du commanditaire", () => {
  assert.match(helper, /normalizeBeneficiarySiret/);
  assert.match(helper, /\^\\d\{14\}\$/);
  assert.match(registrationRoute, /normalizeBeneficiarySiret\(needAnswers\.beneficiary_siret\)/);
  assert.match(registrationRoute, /validateOptionalBeneficiarySiret\(beneficiarySiret\)/);
  assert.match(registrationRoute, /needAnswers\.beneficiary_siret = beneficiarySiret \|\| null/);
  assert.match(registrationRoute, /delete needAnswers\.beneficiary_siret/);
  assert.match(registrationRoute, /Le SIRET doit comporter exactement 14 chiffres/);
  assert.match(registrationRoute, /company_name: responseType === "company" \? text\(body, "company_name"\) \|\| null : null/);
  assert.match(registrationRoute, /participants: responseType === "company" \? jsonArray\(body\.participants\) : \[\]/);
});

test("le parcours candidature expose les deux rôles sans transformer un bénéficiaire en entreprise", () => {
  assert.match(registrationPage, /Je suis apprenant/);
  assert.match(registrationPage, /Je représente une entreprise/);
  assert.match(registrationRoute, /\["beneficiary", "company"\]/);
});

test("le champ SIRET bénéficiaire explique le bon choix de profil et reste facultatif", () => {
  assert.match(beneficiarySiretFields, /même si vous avez un SIRET/);
  assert.match(beneficiarySiretFields, /réservé à la personne qui inscrit ou représente un autre bénéficiaire/);
  assert.match(beneficiarySiretFields, /Votre SIRET professionnel, si vous en avez un/);
  assert.match(beneficiarySiretFields, /Facultatif/);
  assert.match(beneficiarySiretFields, /ne crée pas d’entreprise commanditaire ni d’espace entreprise/);
  assert.match(beneficiarySiretFields, /normalizeBeneficiarySiret/);
  assert.match(beneficiarySiretFields, /exactement 14 chiffres/);
});
