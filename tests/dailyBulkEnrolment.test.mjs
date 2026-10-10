import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../app/api/client/daily/enrolments/bulk/route.ts", import.meta.url), "utf8");
test("bulk enrolment checks organisation ownership of session and learners", () => {
  assert.match(source, /getDailyOrganisationContext\(req, "sessions"/);
  assert.match(source, /\.eq\("organisation_id", context\.organisationId\)/);
  assert.match(source, /learners \?\? \[\]\)\.length !== learnerIds\.length/);
});
test("bulk enrolment prevents duplicate requests and sends per learner", () => {
  assert.match(source, /new Set\(learnerIds\)\.size !== learnerIds\.length/);
  assert.match(source, /status: "already_enrolled"/);
  assert.match(source, /ensureAndSendLearnerPortalAccess/);
  assert.match(source, /results\.push\(\{ learnerId, status: "created"/);
});
test("bulk enrolment caps batch size and validates email", () => {
  assert.match(source, /learnerIds\.length \+ newLearners\.length > 30/);
  assert.match(source, /missingEmail/);
});

test("concurrent duplicate enrolments recover the existing enrolment and check access", () => {
  assert.match(source, /insertError\?\.code === "23505"/);
  assert.match(source, /data: concurrent, error: concurrentError/);
  assert.match(source, /enrolmentId: concurrent\.id/);
  assert.match(source, /status: "already_enrolled", enrolmentId: concurrent\.id, accessStatus/);
});
test("failed access delivery is reported separately from enrolment creation", () => {
  assert.match(source, /const accessFailed = results\.filter/);
  assert.match(source, /accessFailed: accessFailed\.map/);
  assert.match(source, /creationFailures\.length \+ accessFailed\.length/);
});
