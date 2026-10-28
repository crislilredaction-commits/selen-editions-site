import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const route = await readFile(
  new URL("../app/api/daily-portal/[token]/positioning/route.ts", import.meta.url),
  "utf8",
);
const { findUniqueDailyLearnerPortalEnrolment } = loadTypeScript(
  "lib/server/dailyPortalLearnerIdentity.ts",
);
const enrolment = (id, email = "shared@example.test") => ({
  id: `enrolment-${id}`,
  learner_id: id,
  status: "active",
  daily_learners: { id, email },
});

test("positioning resolves a canonical learner even when two learners share an email", () => {
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

test("legacy positioning links fail closed for shared or missing emails", () => {
  const rows = [enrolment("first"), enrolment("second")];
  assert.equal(findUniqueDailyLearnerPortalEnrolment({
    entity_email: "shared@example.test",
  }, rows), null);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({
    entity_name: "Alice Martin",
  }, rows), null);
  assert.equal(findUniqueDailyLearnerPortalEnrolment({
    entity_email: "",
  }, [enrolment("no-email", "")]), null);
});

test("unique legacy email remains usable for positioning", () => {
  const rows = [enrolment("first"), enrolment("second", "unique@example.test")];
  assert.equal(findUniqueDailyLearnerPortalEnrolment({
    entity_email: " UNIQUE@example.test ",
  }, rows), rows[1]);
});

test("positioning GET and POST share canonical identity resolution before reading or writing answers", () => {
  assert.match(route, /select\("id,session_id,portal_type,entity_key,entity_email,status,expires_at"\)/);
  assert.match(route, /findUniqueDailyLearnerPortalEnrolment\(access,enrolments\?\?\[\]\)/);
  assert.doesNotMatch(route, /enrolments\?\?\[\]\)\.find\(/);
  assert.match(route, /export async function GET[\s\S]*?await resolve\(clean\)/);
  assert.match(route, /export async function POST[\s\S]*?await resolve\(clean\)/);
});

test("positioning only considers active enrolments within the current organisation and session", () => {
  assert.match(route, /\.eq\("session_id",session\.id\)\.eq\("organisation_id",session\.organisation_id\)/);
  assert.match(route, /\.not\("status","in","\(declined,cancelled,abandoned\)"\)/);
  assert.match(route, /if\(!enrolment\)return\{error:"Inscription apprenant introuvable\."/);
});
