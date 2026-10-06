import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const helperSource = fs.readFileSync("lib/server/dailyPostSignatureLearnerAccess.ts", "utf8");
const accessSource = fs.readFileSync("lib/server/dailyLearnerPortalAccess.ts", "utf8");
const signatureRoute = fs.readFileSync("app/api/daily-signature/[token]/route.ts", "utf8");

function loadMatcher() {
  const module = { exports: {} };
  const code = ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) { if (name.startsWith("@/")) return {}; throw new Error(name); } });
  return module.exports.enrolmentMatchesSignedConvention;
}

const learner = { email: "alice@example.test", first_name: "Alice", last_name: "Martin" };
const base = { id: "enrolment-1", status: "confirmed", contracting_party_type: "individual", company_name: null, company_contact_email: null, daily_learners: learner };

test("A8 relie la signature individuelle uniquement à l'inscription du bon apprenant", () => {
  const matches = loadMatcher();
  const convention = { recipient_type: "beneficiary", recipient_key: "alice@example.test", recipient_email: "ALICE@example.test", recipient_name: "Alice Martin" };
  assert.equal(matches(base, convention), true);
  assert.equal(matches({ ...base, id: "other", daily_learners: { ...learner, email: "bob@example.test", first_name: "Bob" } }, convention), false);
});

test("A8 relie une convention entreprise aux seules inscriptions de l'entreprise commanditaire", () => {
  const matches = loadMatcher();
  const convention = { recipient_type: "company", recipient_key: "company@example.test", recipient_email: "company@example.test", company_name: "Entreprise A" };
  assert.equal(matches({ ...base, contracting_party_type: "company", company_name: "Entreprise A", company_contact_email: "company@example.test" }, convention), true);
  assert.equal(matches({ ...base, contracting_party_type: "company", company_name: "Entreprise B", company_contact_email: "company@example.test" }, convention), false);
  assert.equal(matches({ ...base, contracting_party_type: "company", company_name: "Entreprise A", company_contact_email: "other@example.test" }, convention), false);
  assert.equal(matches({ ...base, contracting_party_type: "individual", company_name: "Entreprise A", company_contact_email: "company@example.test" }, convention), false);
});

test("A8 exclut les inscriptions sans action post-signature", () => {
  const matches = loadMatcher();
  const convention = { recipient_type: "beneficiary", recipient_key: base.id, recipient_email: learner.email };
  for (const status of ["declined", "cancelled", "abandoned"]) assert.equal(matches({ ...base, status }, convention), false);
});

test("A8 déclenche documents, accès apprenant et clôture des relances sur signature et rejeu", () => {
  assert.match(signatureRoute, /openPostSignatureAvailability/);
  assert.match(signatureRoute, /pack\.status !== "sent" && pack\.status !== "already_sent"/);
  assert.match(signatureRoute, /sendPostSignatureLearnerAccess/);
  assert.match(signatureRoute, /resolveReminderWithoutBreakingSignature/);
  assert.equal((signatureRoute.match(/openPostSignatureAvailability\(/g) ?? []).length, 3);
  assert.match(signatureRoute, /learnerAccess/);
});

test("A8 réserve une notification post-signature idempotente distincte du premier accès", () => {
  assert.match(accessSource, /source === "post_signature" \? "learner_start_pack_available" : "learner_portal_access"/);
  assert.match(accessSource, /contains\("metadata", \{ portal_access_id: access\.id, enrolment_id: enrolment\.id \}\)/);
  assert.match(accessSource, /auth_protected: true/);
  assert.match(accessSource, /convocation, votre livret d’accueil et le règlement intérieur/);
});
