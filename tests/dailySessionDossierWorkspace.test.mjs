import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pagePath = new URL("../app/client/daily/dossiers/page.tsx", import.meta.url);
const routePath = new URL("../app/api/client/daily/session-dossiers/route.ts", import.meta.url);

const [page, route] = await Promise.all([
  readFile(pagePath, "utf8"),
  readFile(routePath, "utf8"),
]);

test("le dossier de session expose une timeline cliquable avant pendant après", () => {
  assert.match(page, /aria-label="Timeline de la session"/);
  assert.match(page, /scrollToPhase\(phase\)/);
  assert.match(page, /id={`phase-\$\{phase\}`}/);
  assert.match(page, /Avant la formation/);
  assert.match(page, /Pendant la formation/);
  assert.match(page, /Après la formation/);
});

test("le dossier réutilise le programme canonique de la formation", () => {
  assert.match(route, /detailed_program/);
  assert.match(route, /detailed_program_document_url/);
  assert.match(route, /registration_methods/);
  assert.match(route, /access_delays/);
  assert.match(page, /Programme applicable à cette session/);
  assert.match(page, /Ouvrir le document programme/);
  assert.match(page, /Modalités d’inscription/);
  assert.match(page, /Délais d’accès/);
});

test("le lot reste une lecture de la formation sans nouvelle source métier", () => {
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /daily_session_program/);
});
