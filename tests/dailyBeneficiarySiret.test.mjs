import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helper = await readFile(new URL("../lib/dailyBeneficiarySiret.ts", import.meta.url), "utf8");
const registrationPage = await readFile(new URL("../app/daily-inscription/[token]/page.tsx", import.meta.url), "utf8");
const registrationRoute = await readFile(new URL("../app/api/daily-registration/[token]/route.ts", import.meta.url), "utf8");

test("le SIRET bénéficiaire est une donnée distincte du commanditaire", () => {
  assert.match(helper, /normalizeBeneficiarySiret/);
  assert.match(helper, /\^\\d\{14\}\$/);
  assert.match(registrationRoute, /company_name: responseType === "company" \? text\(body, "company_name"\) \|\| null : null/);
  assert.match(registrationRoute, /participants: responseType === "company" \? jsonArray\(body\.participants\) : \[\]/);
});

test("le parcours candidature expose les deux rôles sans transformer un bénéficiaire en entreprise", () => {
  assert.match(registrationPage, /Je suis apprenant/);
  assert.match(registrationPage, /Je représente une entreprise/);
  assert.match(registrationRoute, /responseType === "beneficiary"|\["beneficiary", "company"\]/);
});
