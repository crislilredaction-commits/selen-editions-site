import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/client/daily/assisted-trainer-portals/route.ts", "utf8");
const layout = readFileSync("app/client/daily/formateur/layout.tsx", "utf8");
const chooser = readFileSync("app/client/daily/formateur/assistance/page.tsx", "utf8");
const preview = readFileSync("app/daily/assistance/portail/[accessId]/page.tsx", "utf8");

test("l'assistance formateur n'utilise jamais le profil personnel de l'agent", () => {
  assert.match(layout, /getStoredAssistanceToken/);
  assert.match(layout, /pathname !== ASSISTANCE_CHOOSER/);
  assert.match(layout, /router\.replace/);
  assert.doesNotMatch(route, /daily_trainer_profiles/);
  assert.match(chooser, /Aucun profil personnel[\s\S]*n’a été utilisé/);
});

test("la sélection reste explicite avec zéro, un ou plusieurs formateurs", () => {
  assert.match(chooser, /portals\.length === 0/);
  assert.match(chooser, /portals\.map/);
  assert.match(chooser, /Ouvrir cet espace/);
  assert.doesNotMatch(chooser, /portals\[0\]/);
  assert.doesNotMatch(chooser, /window\.location\.assign\([^)]*portals/);
});

test("les accès sont bornés aux sessions de l'OF et dédupliqués sans perdre les multi-sessions", () => {
  assert.match(route, /\.eq\("organisation_id", context\.organisationId\)/);
  assert.match(route, /\.in\("session_id", sessionIds\)/);
  assert.match(route, /\.eq\("portal_type", "trainer"\)/);
  assert.match(route, /const key = `\$\{portal\.session_id\}:\$\{accessIdentity\(portal\)\}`/);
  assert.match(route, /Espace formateur hors de l’organisme assisté/);
});

test("l'ouverture crée un jeton A10 court et strictement limité à l'accès choisi", () => {
  assert.match(route, /scope: "portal_preview"/);
  assert.match(route, /portal_access_id: portal\.id/);
  assert.match(route, /parent_assistance_token_id/);
  assert.match(route, /CHILD_TOKEN_MINUTES = 15/);
  assert.match(preview, /scope === "portal_preview" && scopedAccessId === accessId/);
  assert.match(preview, /!exactPortalPreview && !delegatedWorkspace/);
  assert.match(preview, /session\.organisation_id, assistance\.organisation_id|eq\("organisation_id", assistance\.organisation_id\)/);
});

test("la sortie du mode assistance rend de nouveau le parcours formateur normal", () => {
  assert.match(layout, /if \(assisted && pathname !== ASSISTANCE_CHOOSER\)/);
  assert.match(layout, /setReady\(true\)/);
});

test("les doubles clics et erreurs visibles sont gérés", () => {
  assert.match(chooser, /if \(openingId\) return/);
  assert.match(chooser, /disabled=\{Boolean\(openingId\)\}/);
  assert.match(chooser, /role="alert"/);
  assert.match(chooser, /Ouverture…/);
});
