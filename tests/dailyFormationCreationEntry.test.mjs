import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/client/daily/formations/new/page.tsx", import.meta.url), "utf8");

test("formation creation offers programme import or Selen form", () => {
  assert.match(page, /Importer mon programme/);
  assert.match(page, /Remplir le formulaire Selen/);
  assert.match(page, /creation=programme/);
  assert.match(page, /creation=formulaire/);
});

test("programme import copy preserves source and avoids needless re-entry", () => {
  assert.match(page, /conserve le fichier original/);
  assert.match(page, /informations complémentaires nécessaires/);
});

test("prerequisites remain an independent human-validated step", () => {
  assert.match(page, /séparément si la formation comporte des prérequis/);
  assert.match(page, /ne vaudra jamais validation automatique/);
  assert.match(page, /positionnement et l’évaluation finale/);
});
