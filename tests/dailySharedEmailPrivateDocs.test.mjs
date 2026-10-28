import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const base = "app/api/daily-portal/[token]/";
const portal = fs.readFileSync(base + "route.ts", "utf8");
const resources = fs.readFileSync(base + "resources/route.ts", "utf8");
const convention = fs.readFileSync(base + "convention/route.ts", "utf8");
const convocation = fs.readFileSync(base + "convocation/route.ts", "utf8");

test("all email-only learner document paths enforce session-wide uniqueness", () => {
  for (const source of [portal, resources, convention, convocation]) {
    assert.match(source, /hasUniqueDailyLearnerRecipientEmail/);
  }
  assert.match(portal, /learnerEmailRecipientUnique\?responseRows\.filter/);
  assert.match(portal, /learnerEmailRecipientUnique\?conventionRows\.filter/);
  assert.match(portal, /learnerEmailRecipientUnique\?convocationRows\.filter/);
  assert.match(resources, /learnerEmailRecipientUnique \? await loadLearnerPretrainingResources/);
  for (const source of [convention, convocation]) {
    assert.match(source, /if \(!hasUniqueDailyLearnerRecipientEmail\(access, rows \?\? \[\]\)\)/);
    assert.match(source, /declined", "cancelled", "abandoned"/);
  }
});
