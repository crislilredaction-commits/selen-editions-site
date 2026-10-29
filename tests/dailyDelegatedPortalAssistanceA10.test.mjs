import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("A10 lie la prévisualisation au token d'assistance et au portail exact", () => {
  const page = read("app/daily/assistance/portail/[accessId]/page.tsx");
  assert.match(page, /scope === "portal_preview" && scopedAccessId === accessId/);
  assert.match(page, /scope === "daily_workspace"/);
  assert.match(page, /\.eq\("organisation_id", assistance\.organisation_id\)/);
  assert.match(page, /\.in\("portal_type", \["learner", "trainer"\]\)/);
  assert.match(page, /\.neq\("status", "archived"\)/);
});

test("A10 garde le portail délégué en lecture seule et traçable", () => {
  const page = read("app/daily/assistance/portail/[accessId]/page.tsx");
  assert.match(page, /strictement en lecture seule/);
  assert.doesNotMatch(page, /method:\s*["']POST["']/);
  assert.doesNotMatch(page, /method:\s*["']PATCH["']/);
  assert.doesNotMatch(page, /method:\s*["']DELETE["']/);
  assert.match(page, /action: "delegated_portal_viewed"/);
  assert.match(page, /portal_access_id: access\.id/);
});

test("A10 conserve le contexte d'assistance dans le type serveur", () => {
  const assistance = read("lib/server/agentAssistance.ts");
  assert.match(assistance, /metadata: Record<string, unknown>/);
  assert.match(assistance, /status, expires_at, metadata/);
  assert.match(assistance, /metadata\?\.scope && assistance\.metadata\.scope !== "daily_workspace"/);
});


test("A10 n'utilise jamais le profil formateur personnel de l'agent en assistance OF", () => {
  const route = read("app/api/client/daily/trainer-profile/route.ts");
  const page = read("app/client/daily/formateur/page.tsx");
  assert.match(route, /delegated\.ok&&delegated\.assisted/);
  assert.match(route, /eq\("organisation_id",delegated\.organisationId\)/);
  assert.match(route, /eq\("portal_type","trainer"\)/);
  assert.match(page, /assistanceFetch\("\/api\/client\/daily\/trainer-profile"/);
  assert.match(page, /Votre propre profil formateur n’est jamais utilisé/);
  assert.match(page, /withAssistanceToken/);
});
