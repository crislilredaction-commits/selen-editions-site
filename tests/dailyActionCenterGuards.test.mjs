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
