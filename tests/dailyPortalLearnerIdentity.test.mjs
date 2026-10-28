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

test("legacy access cannot use a matching display name as a private identity", () => {
  const access = { entity_key: null, entity_name: "  Alice   Martin " };
  const row = {
    learner_id: "legacy",
    daily_learners: { first_name: "Alice", last_name: "Martin", email: null },
  };

  assert.equal(matchesDailyLearnerPortalAccess(access, row), false);
});

test("an incomplete identity never matches an enrolment", () => {
  assert.equal(matchesDailyLearnerPortalAccess({}, enrolment("learner")), false);
});

test("unique learner resolution prefers canonical keys when learners share an email", () => {
  const { findUniqueDailyLearnerPortalEnrolment } = loadTypeScript(
    "lib/server/dailyPortalLearnerIdentity.ts",
  );
  const rows = [enrolment("first"), enrolment("second")];
  assert.equal(
    findUniqueDailyLearnerPortalEnrolment({ entity_key: "learner:second", entity_email: "shared@example.test" }, rows),
    rows[1],
  );
  assert.equal(
    findUniqueDailyLearnerPortalEnrolment({ entity_email: "shared@example.test" }, rows),
    null,
  );
});

test("learner resolution rejects absent, incomplete or ambiguous identities", () => {
  const { findUniqueDailyLearnerPortalEnrolment } = loadTypeScript(
    "lib/server/dailyPortalLearnerIdentity.ts",
  );
  const rows = [enrolment("first", ""), enrolment("second", "other@example.test")];
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_email: "" }, rows), null);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_name: "Someone" }, rows), null);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_key: "learner:missing" }, rows), null);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_email: "other@example.test" }, rows), rows[1]);
});
