import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const helper = fs.readFileSync("lib/server/dailyEnterprisePortalAccess.ts", "utf8");
const registrationRoute = fs.readFileSync("app/api/client/daily/registration-requests/route.ts", "utf8");
const sessionsRoute = fs.readFileSync("app/api/client/daily/sessions/route.ts", "utf8");
const portalRoute = fs.readFileSync("app/api/daily-portal/[token]/route.ts", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");

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

test("public portal response exposes only the session fields required by the stakeholder UI", () => {
  assert.match(portalRoute, /const publicSession=\{id:session\.id,internal_reference:session\.internal_reference/);
  assert.match(portalRoute, /session:publicSession/);
  assert.doesNotMatch(portalRoute, /publicSession=\{[^}]*user_id:/);
  assert.doesNotMatch(portalRoute, /publicSession=\{[^}]*organisation_id:/);
  assert.doesNotMatch(portalRoute, /publicSession=\{[^}]*registration_summary:/);
  assert.doesNotMatch(portalRoute, /publicSession=\{[^}]*created_at:/);
});

test("enterprise participants come from active canonical enrolments for the selected company", () => {
  assert.match(portalRoute, /id,learner_id,company_name,status,positioning_status/);
  assert.match(portalRoute, /const companyName=String\(company\?\.name\?\?""\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(portalRoute, /const enterpriseParticipants=access\.portal_type==="enterprise"\?\(enrolmentsR\.data\?\?\[\]\)\.filter/);
  assert.match(portalRoute, /String\(row\.company_name\?\?""\)\.trim\(\)\.toLowerCase\(\)===companyName/);
  assert.match(portalRoute, /participants:access\.portal_type==="enterprise"\?enterpriseParticipants/);
  assert.doesNotMatch(portalRoute, /participants:access\.portal_type==="enterprise"\?asArray\(company\?\.participants\)/);
});

test("registration companies are synchronized into the session before portal access", () => {
  assert.match(helper, /response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,participants,attached_session_id/);
  assert.match(helper, /nextCompanies\.push\(registrationCompany\)/);
  assert.match(helper, /update\(\{ companies: nextCompanies/);
});

test("manual retry is scoped to the current organisation and matching formation", () => {
  assert.match(registrationRoute, /select\("formation_id,attached_session_id"\)/);
  assert.match(registrationRoute, /select\("organisation_id,formation_id"\)/);
  assert.match(registrationRoute, /sessionScope\.organisation_id !== access\.organisationId/);
  assert.match(registrationRoute, /sessionScope\.formation_id !== requestScope\.formation_id/);
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

test("enterprise portal access guard is executed by the production build", () => {
  assert.match(packageJson, /test:daily-enterprise-portal-access/);
  assert.match(packageJson, /npm run test:daily-enterprise-portal-access/);
});
