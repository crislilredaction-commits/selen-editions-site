import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/client/daily/registration-requests/route.ts", "utf8");
const helper = fs.readFileSync("lib/server/dailyLearnerPortalAccess.ts", "utf8");

test("materialized registrations trigger learner portal provisioning", () => {
  assert.match(route, /sendLearnerPortalAccessForRegistrationRequest/);
  assert.match(route, /learner_access/);
  assert.match(route, /decision === "accepted"/);
  assert.match(route, /body\.action === "materialize"/);
});

test("learner portal access reuses the existing canonical token surface", () => {
  assert.match(helper, /from\("daily_portal_access_tokens"\)/);
  assert.match(helper, /portal_type: "learner"/);
  assert.match(helper, /entityKey = `learner:\$\{learner\.id\}`/);
  assert.match(helper, /\.eq\("session_id", session\.id\)/);
  assert.match(helper, /\.eq\("portal_type", "learner"\)/);
  assert.match(helper, /\.eq\("entity_key", entityKey\)/);
});

test("the learner does not need a Supabase account before opening the portal", () => {
  assert.match(helper, /user_id: session\.user_id/);
  assert.doesNotMatch(helper, /auth\.admin\.createUser/);
  assert.doesNotMatch(helper, /signUp/);
});

test("portal access email is traceable and idempotent", () => {
  assert.match(helper, /communication_type: "learner_portal_access"/);
  assert.match(helper, /contains\("metadata", \{ portal_access_id: access\.id, enrolment_id: enrolment\.id \}\)/);
  assert.match(helper, /status: "already_sent"/);
  assert.match(helper, /provider_message_id/);
});

test("missing email or a provider failure never cancels the enrolment", () => {
  assert.match(helper, /status: "missing_email"/);
  assert.match(helper, /status: "send_failed"/);
  assert.doesNotMatch(helper, /daily_session_enrolments"\)\.delete/);
  assert.doesNotMatch(helper, /status:\s*"cancelled"/);
});

test("expired or revoked portal links are renewed instead of duplicated", () => {
  assert.match(helper, /\["revoked", "expired"\]/);
  assert.match(helper, /\.update\(\{ token, status: "pending"/);
  assert.match(helper, /randomBytes\(32\)\.toString\("base64url"\)/);
});

test("only the organisation manager can manually retry learner access delivery", () => {
  assert.match(route, /body\.action === "send_learner_access"/);
  assert.match(route, /Seul le responsable de l'organisme peut relancer les accès apprenants/);
});
