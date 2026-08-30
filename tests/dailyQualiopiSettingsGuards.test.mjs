import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/client/daily/quality-settings/route.ts", import.meta.url), "utf8");

test("le statut Qualiopi est lu depuis l'organisme canonique", () => {
  assert.match(route, /\.from\("organisations"\)/);
  assert.match(route, /qualiopi_status,qualiopi_valid_from,qualiopi_valid_until/);
  assert.match(route, /readCanonicalQualiopi\(organisationId\)/);
  assert.doesNotMatch(route, /\.from\("daily_onboarding"\)[\s\S]*?\.select\("qualiopi_status/);
});

test("le suivi qualité reste forcé pour un organisme Qualiopi", () => {
  assert.match(route, /required: status === "yes" \|\| status === "certified"/);
  assert.match(route, /enabled: qualiopi\.required \|\| data\?\.quality_tracking_enabled !== false/);
  assert.match(route, /const enabled = qualiopi\.required \? true : body\.enabled/);
});

test("les dates du cycle Qualiopi sont exposées au client", () => {
  assert.match(route, /qualiopiValidFrom: qualiopi\.validFrom/);
  assert.match(route, /qualiopiValidUntil: qualiopi\.validUntil/);
});

test("le PATCH refuse une valeur de suivi qualité ambiguë", () => {
  assert.match(route, /typeof body\.enabled !== "boolean"/);
  assert.match(route, /Valeur de suivi qualité invalide/);
});
