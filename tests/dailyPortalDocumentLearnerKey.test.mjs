import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/daily-portal/[token]/document/route.ts", import.meta.url), "utf8");
const resources = await readFile(new URL("../app/api/daily-portal/[token]/resources/route.ts", import.meta.url), "utf8");

test("document download loads the same learner entity key as resource listing", () => {
  assert.match(route, /select\("id,session_id,portal_type,entity_key,entity_name,entity_email,status,expires_at"\)/);
  assert.match(route, /matchesDailyLearnerPortalAccess\(access,row\)/);
  assert.match(resources, /matchesDailyLearnerPortalAccess\(access, row\)/);
});

test("learner entity key is authoritative even when another learner shares email", () => {
  assert.match(route, /dailyPortalLearnerIdentity/);
  assert.match(route, /if\(access\.portal_type==="learner"\)\{const\{data:enrolments/);
});

test("legacy email fallback remains limited to tokens without an entity key", () => {
  assert.doesNotMatch(route, /normalizedEmail|relatedLearner/);
  assert.match(route, /matchesDailyLearnerPortalAccess\(access,row\)/);
  assert.match(route, /\.not\("status","in","\(declined,cancelled,abandoned\)"\)/);
});
