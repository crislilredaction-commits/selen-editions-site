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

test("Daily expose un accès Réclamations hors des flux autonomes", () => {
  assert.match(dailyLayout, /href="\/client\/daily\/reclamations"/);
  assert.match(dailyLayout, />\s*Réclamations\s*</);
  assert.match(dailyLayout, /showQuickActions = !isStandaloneFlow/);
});

test("l'accès Réclamations pointe vers le formulaire déjà existant", () => {
  assert.match(reclamationsPage, /NewFeedbackForm/);
});
