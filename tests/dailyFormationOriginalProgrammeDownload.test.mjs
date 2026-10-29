import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("components/daily/FormationSourceUpload.tsx", "utf8");

test("programme source remains directly accessible after upload", () => {
  assert.match(source, /href=\{value\}/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /Ouvrir \/ télécharger l’original/);
  assert.match(source, /Document original conservé/);
});

test("replacing the source does not hide the retained original action", () => {
  assert.match(source, /value \? "Remplacer le fichier" : "Choisir un fichier"/);
  assert.match(source, /value \? <div/);
});
