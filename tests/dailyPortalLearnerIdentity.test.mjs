import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const { matchesDailyLearnerPortalAccess } = loadTypeScript(
  "lib/server/dailyPortalLearnerIdentity.ts",
);

const enrolment = (learnerId, learnerEmail = "shared@example.test") => ({
  learner_id: learnerId,
  daily_learners: { email: learnerEmail },
});

test("canonical learner key never falls back to a shared email", () => {
  const access = { entity_key: "learner:cancelled", entity_email: "shared@example.test" };

  assert.equal(matchesDailyLearnerPortalAccess(access, enrolment("active")), false);
  assert.equal(matchesDailyLearnerPortalAccess(access, enrolment("cancelled")), true);
});

test("legacy access without a key can still use its normalized email", () => {
  const access = { entity_key: null, entity_email: " Shared@Example.Test " };

  assert.equal(matchesDailyLearnerPortalAccess(access, enrolment("legacy")), true);
  assert.equal(matchesDailyLearnerPortalAccess(access, enrolment("other", "other@example.test")), false);
});

test("legacy access without a key can still use its normalized name", () => {
  const access = { entity_key: null, entity_name: "  Alice   Martin " };
  const row = {
    learner_id: "legacy",
    daily_learners: { first_name: "Alice", last_name: "Martin", email: null },
  };

  assert.equal(matchesDailyLearnerPortalAccess(access, row), true);
});

test("an incomplete identity never matches an enrolment", () => {
  assert.equal(matchesDailyLearnerPortalAccess({}, enrolment("learner")), false);
});
