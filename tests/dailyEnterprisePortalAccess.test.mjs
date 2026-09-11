import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const helper = fs.readFileSync("lib/server/dailyEnterprisePortalAccess.ts", "utf8");
const registrationRoute = fs.readFileSync("app/api/client/daily/registration-requests/route.ts", "utf8");
const sessionsRoute = fs.readFileSync("app/api/client/daily/sessions/route.ts", "utf8");
const portalRoute = fs.readFileSync("app/api/daily-portal/[token]/route.ts", "utf8");

test("accepted company registrations provision the enterprise portal after materialization", () => {
  assert.match(registrationRoute, /sendEnterprisePortalAccessForRegistrationRequest/);
  assert.match(registrationRoute, /provisionAcceptedAccesses/);
  assert.match(registrationRoute, /enterprise_access: enterpriseAccess/);
  assert.match(registrationRoute, /decision === "accepted"/);
  assert.match(registrationRoute, /body\.action === "materialize"/);
});

test("manual companies added to a session provision the same canonical enterprise access", () => {
  assert.match(sessionsRoute, /sendEnterprisePortalAccessForSessionCompanies/);
  assert.match(sessionsRoute, /source: "manual_company"/);
  assert.match(sessionsRoute, /enterprise_access: enterpriseAccess/);
});

test("enterprise access reuses daily_portal_access_tokens and the existing enterprise portal", () => {
  assert.match(helper, /from\("daily_portal_access_tokens"\)/);
  assert.match(helper, /portal_type: "enterprise"/);
  assert.match(helper, /entityKey = `enterprise:\$\{email\}`/);
  assert.match(helper, /\/daily\/portail\/enterprise\//);
  assert.match(portalRoute, /access\.portal_type==="enterprise"/);
});

test("registration companies are synchronized into the session before portal access", () => {
  assert.match(helper, /response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,participants,attached_session_id/);
  assert.match(helper, /nextCompanies\.push\(registrationCompany\)/);
  assert.match(helper, /update\(\{ companies: nextCompanies/);
});

test("enterprise access email is traceable and idempotent", () => {
  assert.match(helper, /communication_type: "enterprise_portal_access"/);
  assert.match(helper, /contains\("metadata", \{ portal_access_id: access\.id \}\)/);
  assert.match(helper, /status: "already_sent"/);
  assert.match(helper, /provider_message_id/);
});

test("expired or revoked enterprise links are renewed instead of duplicated", () => {
  assert.match(helper, /\["revoked", "expired"\]/);
  assert.match(helper, /status: "pending"/);
  assert.match(helper, /randomBytes\(32\)\.toString\("base64url"\)/);
});

test("missing email or provider failure does not roll back the validated registration or session", () => {
  assert.match(helper, /status: "missing_email"/);
  assert.match(helper, /status: "send_failed"/);
  assert.doesNotMatch(helper, /daily_sessions"\)\.delete/);
  assert.doesNotMatch(helper, /daily_session_enrolments"\)\.delete/);
});
