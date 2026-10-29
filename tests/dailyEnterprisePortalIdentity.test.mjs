import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveEnterprisePortalCompany, matchesEnterprisePortalRecipient } from "../lib/daily/enterprisePortalIdentity.mjs";

const route = fs.readFileSync("app/api/daily-portal/[token]/route.ts", "utf8");

test("a unique company is resolved by token email, not by display name", () => {
  const companies = [{ name: "Alpha", email: "ALPHA@example.fr" }, { name: "Beta", email: "beta@example.fr" }];
  assert.deepEqual(resolveEnterprisePortalCompany(companies, " alpha@example.fr "), { status: "ok", company: companies[0] });
  assert.equal(resolveEnterprisePortalCompany(companies, "absent@example.fr").status, "missing");
  assert.equal(resolveEnterprisePortalCompany(companies, "").status, "missing");
});

test("ambiguous company emails or names fail closed", () => {
  assert.equal(resolveEnterprisePortalCompany([{ name: "A", email: "shared@example.fr" }, { name: "B", email: "shared@example.fr" }], "shared@example.fr").status, "ambiguous");
  assert.equal(resolveEnterprisePortalCompany([{ name: "Même nom", email: "a@example.fr" }, { name: "même nom", email: "b@example.fr" }], "a@example.fr").status, "ambiguous");
  assert.equal(resolveEnterprisePortalCompany([{ name: "", email: "a@example.fr" }], "a@example.fr").status, "missing");
});

test("private enterprise documents require a matching email, never a name", () => {
  assert.equal(matchesEnterprisePortalRecipient("billing@example.fr", "BILLING@example.fr"), true);
  assert.equal(matchesEnterprisePortalRecipient("", "billing@example.fr"), false);
  assert.equal(matchesEnterprisePortalRecipient("other@example.fr", "billing@example.fr"), false);
  assert.equal(matchesEnterprisePortalRecipient("billing@example.fr", ""), false);
});

test("public enterprise route rejects ambiguous identity and filters private records", () => {
  assert.match(route, /resolveEnterprisePortalCompany\(companies,entityEmail\)/);
  assert.match(route, /enterpriseIdentity\.status!=="ok"/);
  assert.match(route, /matchesEnterprisePortalRecipient\(r\.respondent_email,entityEmail\)/);
  assert.match(route, /matchesEnterprisePortalRecipient\(c\.recipient_email,entityEmail\)/);
  assert.doesNotMatch(route, /entityName&&String\([rc]\.company_name/);
});
