import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/client/daily/trainer-certification-register/route.ts", "utf8");
const page = fs.readFileSync("app/client/daily/formateurs/certifications/page.tsx", "utf8");
const context = fs.readFileSync("lib/server/dailyOrganisationContext.ts", "utf8");

test("le registre de certifications est une lecture organisme compatible assistance agent", () => {
  assert.match(context, /type DailyCapability = [^;]*"trainers"/);
  assert.match(route, /getDailyOrganisationReadContext\(req, \["trainers"\]\)/);
  assert.match(route, /\.eq\("organisation_id", organisationId\)/);
  assert.match(route, /\.in\("trainer_profile_id", trainerIds\)/);
  assert.match(route, /document_type", "trainer_qualification_proof"/);
  assert.match(route, /\.eq\("is_current", true\)/);
  assert.match(route, /createSignedUrl\(proof\.storage_path, 600\)/);
});

test("le registre n'expose aucune méthode d'écriture", () => {
  assert.doesNotMatch(route, /export async function (POST|PATCH|PUT|DELETE)/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("l'interface annonce la consultation seule et permet d'ouvrir le justificatif", () => {
  assert.match(page, /strictement en lecture seule/);
  assert.match(page, /Mode assistance agent : consultation uniquement/);
  assert.match(page, /Voir le justificatif/);
  assert.match(page, /assistanceToken/);
});
