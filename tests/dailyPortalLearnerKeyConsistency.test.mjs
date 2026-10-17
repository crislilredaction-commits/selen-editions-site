import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const portal = await readFile(new URL("../app/api/daily-portal/[token]/route.ts", import.meta.url), "utf8");
const pdf = await readFile(new URL("../app/api/daily-portal/[token]/program-pdf/route.ts", import.meta.url), "utf8");
const document = await readFile(new URL("../app/api/daily-portal/[token]/document/route.ts", import.meta.url), "utf8");

test("learner portal resolves by entity key before legacy email or name fallback", () => {
  assert.match(portal, /return entityKey\?entityKey===`learner:\$\{row\.learner_id\}`:Boolean\(linked/);
});

test("private program PDF does not fall back to shared email when entity key exists", () => {
  assert.match(pdf, /entityKey \? entityKey === `learner:\$\{row\.learner_id\}` :/);
  assert.match(pdf, /Boolean\(entityEmail && entityEmail === email\(related\(row\.daily_learners\)\?\.email\)\)/);
});

test("document download and PDF use entity key first", () => {
  assert.match(document, /entityKey\?entityKey===`learner:\$\{text\(row\.learner_id\)\}`/);
  assert.match(pdf, /const entityKey = text\(access\.entity_key\)/);
});
