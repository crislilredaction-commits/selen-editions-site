import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const grimoire = readFileSync(new URL("../components/daily/DailyGrimoire.tsx", import.meta.url), "utf8");
const clientLayout = readFileSync(new URL("../app/client/daily/layout.tsx", import.meta.url), "utf8");
const portalLayout = readFileSync(new URL("../app/daily/portail/[role]/[token]/layout.tsx", import.meta.url), "utf8");

test("le Grimoire public reste séparé par rôle et ne contient aucune donnée Studio", () => {
  assert.match(grimoire, /type Role = "organisation" \| "learner" \| "trainer"/);
  assert.match(grimoire, /roleLabels/);
  assert.doesNotMatch(grimoire, /\/agent\//);
  assert.doesNotMatch(grimoire, /organisation_id|agent_profile|note interne/i);
});

test("le Grimoire propose parcours, FAQ, recherche et cartes repliées", () => {
  assert.match(grimoire, /Mon parcours/);
  assert.match(grimoire, /Questions fréquentes/);
  assert.match(grimoire, /type="search"/);
  assert.match(grimoire, /<details key=/);
  assert.match(grimoire, /contextHelp\(role, pathname\)/);
});

test("les liens du Grimoire visent uniquement les parcours Daily existants", () => {
  assert.match(grimoire, /\/client\/daily\/formations/);
  assert.match(grimoire, /\/client\/daily\/sessions/);
  assert.match(grimoire, /`\$\{base\}\/positionnement`/);
  assert.match(grimoire, /`\$\{base\}\/presence`/);
  assert.match(grimoire, /`\$\{base\}\/evaluation`/);
  assert.match(grimoire, /`\$\{base\}\/feedback`/);
});

test("le bouton flottant est installé sur l'espace OF et les portails apprenant/formateur", () => {
  assert.match(clientLayout, /pathname === "\/client\/daily\/formateur" \|\| pathname\.startsWith\("\/client\/daily\/formateur\/"\)/);
  assert.doesNotMatch(clientLayout, /pathname\.startsWith\("\/client\/daily\/formateur"\) \? "trainer"/);
  assert.match(portalLayout, /isLearner \|\| isTrainer/);
  assert.match(portalLayout, /portalBasePath=\{portalBasePath\} raised/);
  assert.match(grimoire, /position:fixed/);
  assert.match(grimoire, /aria-expanded=\{open\}/);
  assert.match(grimoire, /event\.key === "Escape"/);
});
