import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const { matchesDailyLearnerPortalAccess, hasUniqueDailyLearnerRecipientEmail } = loadTypeScript(
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


test("email-only private documents reject two active learners sharing an email", () => {
  const rows = [enrolment("one"), enrolment("two")];
  assert.equal(hasUniqueDailyLearnerRecipientEmail({ entity_key: "learner:one", entity_email: "shared@example.test" }, rows), false);
  assert.equal(hasUniqueDailyLearnerRecipientEmail({ entity_email: "shared@example.test" }, rows), false);
});

test("email-only private documents reject a collision with a cancelled enrolment", () => {
  const rows = [{ ...enrolment("one"), status: "active" }, { ...enrolment("cancelled"), status: "cancelled" }];
  assert.equal(hasUniqueDailyLearnerRecipientEmail({ entity_key: "learner:one", entity_email: "shared@example.test" }, rows), false);
});

test("email-only private documents allow one canonical or legacy recipient", () => {
  const rows = [enrolment("one"), enrolment("other", "other@example.test")];
  assert.equal(hasUniqueDailyLearnerRecipientEmail({ entity_key: "learner:one", entity_email: " SHARED@example.test " }, rows), true);
  assert.equal(hasUniqueDailyLearnerRecipientEmail({ entity_email: "shared@example.test" }, rows), true);
  assert.equal(hasUniqueDailyLearnerRecipientEmail({ entity_key: "learner:other", entity_email: "shared@example.test" }, rows), false);
  assert.equal(hasUniqueDailyLearnerRecipientEmail({ entity_key: "learner:one", entity_email: "" }, rows), false);
});
