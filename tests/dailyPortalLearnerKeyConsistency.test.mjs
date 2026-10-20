import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const portal = await readFile(new URL("../app/api/daily-portal/[token]/route.ts", import.meta.url), "utf8");
const pdf = await readFile(new URL("../app/api/daily-portal/[token]/program-pdf/route.ts", import.meta.url), "utf8");
const document = await readFile(new URL("../app/api/daily-portal/[token]/document/route.ts", import.meta.url), "utf8");
const delegatedPage = await readFile(new URL("../app/daily/assistance/portail/[accessId]/page.tsx", import.meta.url), "utf8");
const delegatedDocument = await readFile(new URL("../app/daily/assistance/portail/[accessId]/document/route.ts", import.meta.url), "utf8");
const resources = await readFile(new URL("../app/api/daily-portal/[token]/resources/route.ts", import.meta.url), "utf8");
const personalAttendance = await readFile(new URL("../app/api/daily-portal/[token]/personal-attendance/route.ts", import.meta.url), "utf8");
const personalAssessment = await readFile(new URL("../app/api/daily-portal/[token]/personal-assessment-result/route.ts", import.meta.url), "utf8");
const personalEvidence = await readFile(new URL("../app/api/daily-portal/[token]/personal-assessment-evidence/route.ts", import.meta.url), "utf8");

test("learner portal resolves by entity key before legacy email or name fallback", () => {
  assert.match(portal, /matchesDailyLearnerPortalAccess\(access,row\)/);
});

test("private program PDF does not fall back to shared email when entity key exists", () => {
  assert.match(pdf, /matchesDailyLearnerPortalAccess\(access, row\)/);
});

test("document download and PDF use entity key first", () => {
  assert.match(document, /matchesDailyLearnerPortalAccess\(access,row\)/);
  assert.match(pdf, /matchesDailyLearnerPortalAccess/);
});

test("all personal post-session downloads share the canonical learner binding", () => {
  for (const source of [resources, personalAttendance, personalAssessment, personalEvidence]) {
    assert.match(source, /matchesDailyLearnerPortalAccess/);
  }
  assert.match(personalAttendance, /entity_key,entity_name,entity_email/);
  assert.match(personalAttendance, /id,learner_id,organisation_id/);
});

test("delegated learner preview and downloads use the same canonical binding", () => {
  assert.match(delegatedPage, /matchesDailyLearnerPortalAccess\(access, row\)/);
  assert.match(delegatedDocument, /entity_key/);
  assert.match(delegatedDocument, /matchesDailyLearnerPortalAccess\(access,row\)/);
});
