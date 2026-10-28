import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../app/api/daily-portal/[token]/route.ts", import.meta.url),
  "utf8",
);

test("public stakeholder payload never selects convention signing bearer tokens", () => {
  const select = route.match(/daily_convention_signatures\(([^)]*)\)/)?.[1];
  assert.ok(select, "convention signature projection must remain explicit");
  assert.equal(select.split(",").map((field) => field.trim()).includes("token"), false);
  assert.match(route, /daily_conventions"\)\.select\("id,recipient_type/);
});

test("the portal rejects unsupported roles before reading private session data", () => {
  const guard = 'if(!["learner","trainer","enterprise"].includes(String(access.portal_type??"")))';
  assert.ok(route.includes(guard));
  assert.ok(route.indexOf(guard) < route.indexOf("const[sessionR"));
});

test("only pending or viewed portal tokens are allowed", () => {
  const guard = 'if(!["pending","viewed"].includes(String(access.status??"")))';
  assert.ok(route.includes(guard));
  assert.ok(route.indexOf(guard) < route.indexOf("const[sessionR"));
});

test("recipient filtering and response projections remain in place", () => {
  assert.match(route, /const filteredConventions=/);
  assert.match(route, /matchesEnterprisePortalRecipient\(c.recipient_email,entityEmail\)/);
  assert.match(route, /conventions:filteredConventions/);
  assert.doesNotMatch(route, /daily_convention_signatures\([^)]*\btoken\b/);
});
