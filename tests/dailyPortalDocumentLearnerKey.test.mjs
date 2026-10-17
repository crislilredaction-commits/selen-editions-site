import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/daily-portal/[token]/document/route.ts", import.meta.url), "utf8");
const resources = await readFile(new URL("../app/api/daily-portal/[token]/resources/route.ts", import.meta.url), "utf8");

test("document download loads the same learner entity key as resource listing", () => {
  assert.match(route, /select\("id,session_id,portal_type,entity_key,entity_name,entity_email,status,expires_at"\)/);
  assert.match(route, /const entityKey=text\(access\.entity_key\)/);
  assert.match(resources, /const entityKey = text\(access\.entity_key\)/);
});

test("learner entity key is authoritative even when another learner shares email", () => {
  assert.match(route, /entityKey\?entityKey===`learner:\$\{text\(row\.learner_id\)\}`:Boolean\(entityEmail&&normalizedEmail/);
  assert.match(route, /if\(access\.portal_type==="learner"\)\{const\{data:enrolments/);
});

test("legacy email fallback remains limited to tokens without an entity key", () => {
  assert.match(route, /:Boolean\(entityEmail&&normalizedEmail\(relatedLearner\(row\.daily_learners\)\?\.email\)===entityEmail\)/);
  assert.match(route, /\.not\("status","in","\(declined,cancelled,abandoned\)"\)/);
});
