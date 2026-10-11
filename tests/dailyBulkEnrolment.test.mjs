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
  assert.match(source, /failed: enrolmentFailed \+ accessFailed\.length/);
  assert.match(source, /enrolmentFailed, accessFailedCount: accessFailed\.length/);
});

test("assistance audit failure does not discard completed enrolment results", () => {
  assert.match(source, /try \{\s*await logAgentAssistanceAction\(/);
  assert.match(source, /catch \(error\) \{\s*console\.error\("Daily : journalisation assistance inscription collective impossible"/);
  assert.match(source, /return NextResponse\.json\(\{/);
});

test("closed registrations are excluded from access delivery", () => {
  assert.match(source, /CLOSED_ENROLMENT_STATUSES/);
  assert.match(source, /CLOSED_ENROLMENT_STATUSES\.has\(existing\.status\)/);
  assert.match(source, /CLOSED_ENROLMENT_STATUSES\.has\(concurrent\.status\)/);
});

test("simultaneous learner profile creation reuses only a matching identity", () => {
  assert.match(source, /createError\?\.code === "23505"/);
  assert.match(source, /text\(concurrent\.first_name\)\.toLowerCase\(\)/);
  assert.match(source, /text\(concurrent\.last_name\)\.toLowerCase\(\)/);
  assert.match(source, /resolvedIds\.includes\(concurrent\.id\)/);
});

test("bulk enrolment rejects duplicate emails before creating profiles", () => {
  assert.match(source, /new Set\(proposedEmails\)\.size !== proposedEmails\.length/);
  assert.match(source, /proposedEmails\.includes\(email\(learner\.email\)\)/);
});

test("company contact email is validated when supplied", () => {
  assert.match(source, /email\(body\.company_contact_email\)/);
  assert.match(source, /L’email du contact entreprise est invalide/);
});

test("bulk form preserves partial-failure feedback after refreshing learners", () => {
  const page = readFileSync(new URL("../app/client/daily/apprenants/page.tsx", import.meta.url), "utf8");
  assert.ok(page.includes('const load=useCallback(async(preserveFeedback=false)=>{if(!preserveFeedback)setError("")'));
  assert.match(page, /await load\(true\)\}catch\(error\)/);
});
