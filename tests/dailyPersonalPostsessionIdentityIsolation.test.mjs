import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const { findUniqueDailyLearnerPortalEnrolment } = loadTypeScript("lib/server/dailyPortalLearnerIdentity.ts");
const enrolment = (id, learnerId, status = "active") => ({
  id, learner_id: learnerId, status, daily_learners: { email: "shared@example.test" },
});
const routes = [
  "app/api/daily-portal/[token]/personal-attendance/route.ts",
  "app/api/daily-portal/[token]/personal-assessment-result/route.ts",
  "app/api/daily-portal/[token]/personal-assessment-evidence/route.ts",
];

test("a legacy email-only link cannot select another enrolment, even when the other is cancelled", () => {
  const rows = [enrolment("active-id", "learner-a"), enrolment("cancelled-id", "learner-b", "cancelled")];
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_email: "shared@example.test" }, rows), null);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_email: "shared@example.test" }, [rows[0]]), rows[0]);
});

test("a canonical learner link selects only its own enrolment despite a shared email", () => {
  const rows = [enrolment("first", "learner-a"), enrolment("second", "learner-b")];
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_key: "learner:learner-b", entity_email: "shared@example.test" }, rows), rows[1]);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({ entity_key: "learner:missing", entity_email: "shared@example.test" }, rows), null);
});

for (const path of routes) {
  test(`${path} checks session-wide unique identity before returning personal evidence`, async () => {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /findUniqueDailyLearnerPortalEnrolment\(access, sessionEnrolments \?\? \[\]\)\?\.id !== enrolment\.id/);
    assert.match(source, /\.eq\("organisation_id", session\.organisation_id\)\s*\.eq\("session_id", session\.id\)/);
    assert.match(source, /\.select\("id,learner_id,status,daily_learners\(email\)"\)/);
    assert.match(source, /!\["pending", "viewed"\]\.includes\(text\(access\.status\)\)/);
    const scopeQuery = source.slice(source.indexOf("const { data: sessionEnrolments"), source.indexOf("if (scopeError)"));
    assert.doesNotMatch(scopeQuery, /\.not\("status"|\.neq\("status"/);
    const guardIndex = source.indexOf("if (findUniqueDailyLearnerPortalEnrolment(access, sessionEnrolments");
    const evidenceIndex = path.includes("personal-attendance")
      ? source.indexOf("const recordBySlot")
      : path.includes("personal-assessment-result")
        ? source.indexOf("const learnerName")
        : source.indexOf("createSignedUrl");
    assert.ok(guardIndex >= 0 && evidenceIndex > guardIndex, "identity check must precede private output");
  });
}
