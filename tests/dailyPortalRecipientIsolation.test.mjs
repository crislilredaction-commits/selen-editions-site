import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveEnterprisePortalCompany } from "../lib/daily/enterprisePortalIdentity.mjs";
const base = "app/api/daily-portal/[token]/";
const portal = fs.readFileSync(base + "route.ts", "utf8");
const resources = fs.readFileSync(base + "resources/route.ts", "utf8");
const document = fs.readFileSync(base + "document/route.ts", "utf8");
const convention = fs.readFileSync(base + "convention/route.ts", "utf8");
const convocation = fs.readFileSync(base + "convocation/route.ts", "utf8");
const identity = fs.readFileSync("lib/server/dailyPortalLearnerIdentity.ts", "utf8");
test("display names never authorize private learner documents", () => {
 assert.doesNotMatch(identity,/entityName && entityName === learnerName/);
 assert.match(identity,/entityEmail && entityEmail === email\(learner\?\.email\)/);
 assert.doesNotMatch(resources,/entityName && text\(row\.recipient_name\)/);
 assert.doesNotMatch(portal,/entityName&&String\(c\.recipient_name/);
 for(const route of [convention,convocation]) { assert.doesNotMatch(route,/entityName && String/); assert.match(route,/matchesDailyLearnerPortalAccess/); assert.match(route,/matches\.length !== 1/); }
});
test("cancelled or ambiguous learner access cannot expose resources", () => {
 assert.match(portal,/learnerMatches\.length>1/);
 assert.match(resources,/matchingRows\.length !== 1/);
 assert.match(document,/matches\.length!==1/);
 assert.match(document,/\["declined","cancelled","abandoned"\]\.includes\(String\(enrolment\.status\?\?""\)\)/);
 for(const route of [convention,convocation]) { assert.match(route,/\["declined", "cancelled", "abandoned"\]\.includes/); assert.match(route,/hasUniqueDailyLearnerRecipientEmail/); }
});
test("enterprise identity is unique and email-bound across listing and downloads", () => {
 for(const route of [portal,resources,document,convention,convocation]) assert.match(route,/resolveEnterprisePortalCompany/);
 assert.equal(resolveEnterprisePortalCompany([{name:"Dupont",email:"a@example.fr"},{name:"Dupont",email:"b@example.fr"}],"a@example.fr").status,"ambiguous");
 assert.doesNotMatch(resources,/item\.name\)\.toLowerCase\(\) === text\(access\.entity_name/);
 assert.match(document,/enterpriseIdentity\?\.company\?\.name/);
});
test("trainer convocation is limited to recipient email", () => {
 assert.match(convocation,/convocation\.recipient_type === "trainer" && Boolean\(entityEmail && normalizedEmail\(convocation\.recipient_email\) === entityEmail\)/);
 assert.match(portal,/c\.recipient_type==="trainer"&&entityEmail&&normalizedEmail\(c\.recipient_email\)===entityEmail/);
});
