import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const route = fs.readFileSync("app/api/client/daily/registration-requests/route.ts", "utf8");
const manualRoute = fs.readFileSync("app/api/client/daily/learners/route.ts", "utf8");
const helper = fs.readFileSync("lib/server/dailyLearnerPortalAccess.ts", "utf8");
const authEntry = fs.readFileSync("lib/server/dailyPortalAuthEntry.ts", "utf8");
const learnerPage = fs.readFileSync("app/client/daily/apprenants/page.tsx", "utf8");

test("materialized registrations trigger learner portal provisioning", () => {
  assert.match(route, /sendLearnerPortalAccessForRegistrationRequest/);
  assert.match(route, /learner_access/);
  assert.match(route, /decision === "accepted"/);
  assert.match(route, /body\.action === "materialize"/);
});

test("manual enrolment triggers the same canonical learner access provisioning", () => {
  assert.match(manualRoute, /ensureAndSendLearnerPortalAccess/);
  assert.match(manualRoute, /action==="enrolment"/);
  assert.match(manualRoute, /source:"manual_enrolment"/);
  assert.match(manualRoute, /learner_access:learnerAccess/);
});

test("learner portal access reuses the existing canonical token surface", () => {
  assert.match(helper, /from\("daily_portal_access_tokens"\)/);
  assert.match(helper, /portal_type: "learner"/);
  assert.match(helper, /entityKey = `learner:\$\{learner\.id\}`/);
  assert.match(helper, /\.eq\("session_id", session\.id\)/);
  assert.match(helper, /\.eq\("portal_type", "learner"\)/);
  assert.match(helper, /\.eq\("entity_key", entityKey\)/);
});

test("manual and registration origins are traced without creating a second access mechanism", () => {
  assert.match(helper, /"accepted_registration_request" \| "manual_enrolment"/);
  assert.match(helper, /source = input\.source \?\? "accepted_registration_request"/);
  assert.match(helper, /source,/);
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

test("learner access email always enters through password activation or login", () => {
  assert.match(helper, /buildDailyPortalAuthEntryUrl/);
  assert.match(helper, /auth_protected: true/);
  assert.match(authEntry, /selen_password_configured/);
  assert.match(authEntry, /type: linkType/);
  assert.match(authEntry, /properties\?\.hashed_token/);
  assert.match(authEntry, /\/client\/activation\?token_hash=/);
  assert.match(authEntry, /\/client\/login\?next=/);
});

test("an existing manual enrolment can receive a fresh secure access link", () => {
  assert.match(manualRoute, /action==="send_access"/);
  assert.match(manualRoute, /source:"manual_resend"/);
  assert.match(manualRoute, /force:true/);
  assert.match(learnerPage, /Renvoyer l’accès sécurisé/);
  assert.match(learnerPage, /action:"send_access"/);
});

async function authEntryFor(user) {
  const generated = [];
  const authAdmin = {
    listUsers: async () => ({ data: { users: user ? [user] : [] }, error: null }),
    generateLink: async (input) => {
      generated.push(input);
      return { data: { properties: { hashed_token: "test-token-hash" } }, error: null };
    },
  };
  const module = { exports: {} };
  const compiled = ts.transpileModule(authEntry, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: () => ({ createClient: () => ({ auth: { admin: authAdmin } }) }),
    process: { env: { NEXT_PUBLIC_SITE_URL: "https://selen.example", NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only" } },
  });
  const url = await module.exports.buildDailyPortalAuthEntryUrl({ email: "learner@example.com", portalType: "learner", token: "personal-portal" });
  return { url: new URL(url), generated };
}

test("a resent access for an unconfirmed invited account remains an invitation", async () => {
  const { url, generated } = await authEntryFor({ email: "learner@example.com", email_confirmed_at: null, user_metadata: {} });
  assert.equal(generated.length, 1);
  assert.equal(generated[0].type, "invite");
  assert.equal(url.searchParams.get("type"), "invite");
  assert.equal(url.searchParams.get("next"), "/daily/portail/apprenant/personal-portal");
});

test("a confirmed account that did not finish password creation receives recovery", async () => {
  const { url, generated } = await authEntryFor({ email: "learner@example.com", email_confirmed_at: "2026-09-29", user_metadata: {} });
  assert.equal(generated[0].type, "recovery");
  assert.equal(url.pathname, "/client/activation");
});

test("an activated learner keeps their password and receives a login destination", async () => {
  const { url, generated } = await authEntryFor({ email: "learner@example.com", email_confirmed_at: "2026-09-29", user_metadata: { selen_password_configured: true } });
  assert.equal(generated.length, 0);
  assert.equal(url.pathname, "/client/login");
  assert.equal(url.searchParams.get("next"), "/daily/portail/apprenant/personal-portal");
});
