import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const manager = readFileSync(new URL("../components/daily/DailyFormationsManager.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/client/daily/formations/assessment-inline/route.ts", import.meta.url), "utf8");

test("l’éditeur intégré permet de choisir les bonnes réponses", () => {
  assert.match(manager, /assessment-correct-\$\{question\.id\}/);
  assert.match(manager, /Bonne réponse \$\{optionIndex \+ 1\}/);
  assert.match(manager, /correct_answers: question\.type === "single_choice"/);
  assert.match(manager, /\.\.\.new Set\(\[\.\.\.question\.correct_answers, option\]\)/);
});

test("modifier une option conserve la saisie brute et recale la bonne réponse", () => {
  assert.match(manager, /const value = e\.target\.value;/);
  assert.match(manager, /options: question\.options\.map\(\(item, i\) => i === optionIndex \? value : item\)/);
  assert.match(manager, /correct_answers: question\.correct_answers\.map\(\(answer\) => answer === previous \? value : answer\)/);
});

test("la validation serveur continue d’exiger une bonne réponse", () => {
  assert.match(route, /question\.correct_answers\.length === 0/);
  assert.match(route, /Chaque question à choix doit comporter au moins deux réponses et une bonne réponse\./);
});
