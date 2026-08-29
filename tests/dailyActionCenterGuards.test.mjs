import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/client/daily/a-faire/page.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/client/daily/action-center/route.ts", import.meta.url), "utf8");

test("le centre À faire conserve les actions Qualité exposées par l'API", () => {
  assert.match(route, /kind:\"quality\"/);
  assert.match(route, /quality:actions\.filter\(x=>x\.kind===\"quality\"\)\.length/);
  assert.match(page, /\| \"quality\"/);
  assert.match(page, /quality\?: number/);
  assert.match(page, /quality: \"Suivi Qualité\"/);
  assert.match(page, /data\.counts\.quality \?\? 0/);
  assert.match(page, /setFilter\(\"quality\"\)/);
});

test("les actions Qualité ouvertes ou planifiées alimentent réellement À faire", () => {
  assert.match(route, /from\(\"daily_quality_actions\"\)/);
  assert.match(route, /\.in\(\"status\",\[\"open\",\"planned\"\]\)/);
  assert.match(route, /quality:action:\$\{item\.id\}/);
  assert.match(route, /\[\"incident\",\"complaint\"\]\.includes/);
  assert.match(route, /item\.status===\"open\"\?\"medium\":\"normal\"/);
  assert.match(route, /href:\"\/client\/daily\/qualite\"/);
});

test("les actions Qualité terminées ne sont pas demandées par le centre À faire", () => {
  assert.doesNotMatch(route, /\.in\(\"status\",\[[^\]]*\"implemented\"/);
  assert.doesNotMatch(route, /\.in\(\"status\",\[[^\]]*\"closed\"/);
});
