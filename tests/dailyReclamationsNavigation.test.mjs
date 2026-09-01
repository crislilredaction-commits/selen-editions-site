import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dailyLayout = await readFile(
  new URL("../app/client/daily/layout.tsx", import.meta.url),
  "utf8",
);

const reclamationsPage = await readFile(
  new URL("../app/client/daily/reclamations/page.tsx", import.meta.url),
  "utf8",
);

test("Daily expose Réclamations en bas hors des flux autonomes", () => {
  assert.match(dailyLayout, /showClaimLink = !isStandaloneFlow/);
  assert.match(dailyLayout, /\{children\}[\s\S]*href="\/client\/daily\/reclamations"/);
  assert.match(dailyLayout, /aria-label="Réclamations Selen Daily"/);
  assert.match(dailyLayout, /const claimFooterStyle/);
});

test("Daily ne place plus Réclamations dans la barre de navigation haute", () => {
  const quickBarStart = dailyLayout.indexOf('aria-label="Navigation Selen Daily"');
  const childrenStart = dailyLayout.indexOf("{children}");
  assert.notEqual(quickBarStart, -1);
  assert.notEqual(childrenStart, -1);
  const quickBarSource = dailyLayout.slice(quickBarStart, childrenStart);
  assert.doesNotMatch(quickBarSource, /\/client\/daily\/reclamations/);
});

test("l'accès Réclamations pointe vers le formulaire déjà existant", () => {
  assert.match(reclamationsPage, /NewFeedbackForm/);
});
