import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const route = await readFile(
  new URL("../app/api/daily-portal/[token]/attendance/route.ts", import.meta.url),
  "utf8",
);
const { findUniqueDailyLearnerPortalEnrolment } = loadTypeScript(
  "lib/server/dailyPortalLearnerIdentity.ts",
);
const enrolment = (id, address = "shared@example.test", status = "active") => ({
  id: `enrolment-${id}`,
  learner_id: id,
  status,
  daily_learners: { id, email: address },
});

test("attendance follows canonical learner identity even for shared email addresses", () => {
  const rows = [enrolment("first"), enrolment("second")];
  assert.equal(findUniqueDailyLearnerPortalEnrolment({
    entity_key: "learner:second",
    entity_email: "shared@example.test",
  }, rows), rows[1]);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({
    entity_key: "learner:missing",
    entity_email: "shared@example.test",
  }, rows), null);
});

test("attendance rejects ambiguous, empty and name-only legacy learner identities", () => {
  const rows = [enrolment("first"), enrolment("second")];
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_email: "shared@example.test" }, rows), null);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_email: "" }, [enrolment("empty", "")]), null);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_name: "Alice Martin" }, rows), null);
});

test("attendance preserves unique legacy email access without including other participants", () => {
  const rows = [enrolment("first"), enrolment("second", "other@example.test")];
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_email: "OTHER@EXAMPLE.TEST" }, rows), rows[1]);
});

test("attendance token resolves a unique active learner before serializing participants and slots", () => {
  assert.match(route, /select\("id,session_id,portal_type,entity_key,entity_email,status,expires_at"\)/);
  assert.match(route, /select\("id,learner_id,status,daily_learners\(id,first_name,last_name,email\)"\)/);
  assert.match(route, /const allEnrolments=enrolmentsR\.data\?\?\[\]/);
  assert.match(route, /const activeEnrolments=allEnrolments\.filter\(row=>!INACTIVE\.has\(text\(row\.status\)\)\)/);
  assert.match(route, /findUniqueDailyLearnerPortalEnrolment\(access,allEnrolments\)/);
  assert.match(route, /!learnerEnrolment\|\|INACTIVE\.has\(text\(learnerEnrolment\.status\)\)/);
  assert.doesNotMatch(route, /findUniqueDailyLearnerPortalEnrolment\(access,activeEnrolments\)/);
  assert.match(route, /const enrolments=access\.portal_type==="trainer"\?activeEnrolments:\[learnerEnrolment!\]/);
  assert.doesNotMatch(route, /email\(learner\?\.email\)===email\(access\.entity_email\)/);
  assert.match(route, /\.eq\("session_id",session\.id\)\.eq\("organisation_id",session\.organisation_id\)/);
  assert.match(route, /"declined","cancelled","abandoned"/);
  assert.doesNotMatch(route, /signature_storage_path|ip_address|user_agent/);
});


test("attendance legacy email token remains ambiguous after a cancellation", () => {
  const rows = [enrolment("cancelled", "shared@example.test", "cancelled"), enrolment("active")];
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_email: "shared@example.test" }, rows), null);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_key: "learner:active", entity_email: "shared@example.test" }, rows), rows[1]);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_key: "learner:cancelled", entity_email: "shared@example.test" }, rows), rows[0]);
  assert.match(route, /INACTIVE\.has\(text\(learnerEnrolment\.status\)\)/);
});

test("attendance rejects unknown portal token states, preserving pending and viewed", () => {
  assert.match(route, /!\["pending","viewed"\]\.includes\(text\(access\.status\)\)/);
  assert.doesNotMatch(route, /\["revoked","expired"\]\.includes\(text\(access\.status\)\)/);
});
