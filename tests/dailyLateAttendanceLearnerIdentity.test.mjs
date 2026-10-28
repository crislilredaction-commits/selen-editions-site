import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const route = await readFile(
  new URL("../app/api/daily-portal/[token]/late-attendance/route.ts", import.meta.url),
  "utf8",
);
const { findUniqueDailyLearnerPortalEnrolment } = loadTypeScript(
  "lib/server/dailyPortalLearnerIdentity.ts",
);
const row = (id, address = "shared@example.test", status = "active") => ({
  id: `enrolment-${id}`,
  learner_id: id,
  status,
  daily_learners: { email: address },
});

test("late attendance resolves the exact canonical learner even when email is shared", () => {
  const enrolments = [row("first"), row("second")];
  assert.equal(findUniqueDailyLearnerPortalEnrolment({
    entity_key: "learner:second", entity_email: "shared@example.test",
  }, enrolments), enrolments[1]);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({
    entity_key: "learner:unknown", entity_email: "shared@example.test",
  }, enrolments), null);
});

test("late attendance rejects legacy email collisions, including cancelled enrolments", () => {
  const enrolments = [row("active"), row("cancelled", "shared@example.test", "cancelled")];
  assert.equal(findUniqueDailyLearnerPortalEnrolment({
    entity_email: "shared@example.test",
  }, enrolments), null);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({
    entity_name: "Same Name",
  }, enrolments), null);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({
    entity_email: "",
  }, [row("empty", "")]), null);
});

test("late attendance keeps unambiguous legacy links usable", () => {
  const enrolments = [row("first"), row("second", "different@example.test")];
  assert.equal(findUniqueDailyLearnerPortalEnrolment({
    entity_email: " DIFFERENT@example.test ",
  }, enrolments), enrolments[1]);
});

test("late signature route binds the token to one enrolment before saving a proof", () => {
  assert.match(route, /select\("id,session_id,portal_type,entity_key,entity_email,status,expires_at"\)/);
  assert.match(route, /select\("id,learner_id,status,daily_learners\(email\)"\)/);
  assert.match(route, /\.eq\("organisation_id", session\.organisation_id\)/);
  assert.match(route, /\.eq\("session_id", session\.id\)/);
  assert.match(route, /findUniqueDailyLearnerPortalEnrolment\(access, enrolments \?\? \[\]\)/);
  assert.match(route, /INACTIVE\.has\(clean\(enrolment\.status\)\)/);
  assert.match(route, /normalizeEmail\(authData\.user\.email\) !== normalizeEmail\(access\.entity_email\)/);
  assert.ok(route.indexOf("findUniqueDailyLearnerPortalEnrolment") < route.indexOf("storage.from(\"documents\").upload"));
  assert.doesNotMatch(route, /\.from\("daily_learners"\)/);
  assert.doesNotMatch(route, /\.ilike\("email"/);
});
