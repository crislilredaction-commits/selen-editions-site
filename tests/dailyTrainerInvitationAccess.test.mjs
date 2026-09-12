import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const trainersPage = fs.readFileSync("app/client/daily/formateurs/page.tsx", "utf8");

test("manual trainer creation provisions canonical trainer workspace access", () => {
  assert.match(trainersPage, /const isCreation=!values\.id/);
  assert.match(trainersPage, /\/api\/client\/daily\/workspace\/invitations/);
  assert.match(trainersPage, /body:JSON\.stringify\(\{action:"create",email,roles:\["trainer"\],permission_blocks:\[\]\}\)/);
});

test("manual trainer creation does not duplicate an active trainer access", () => {
  assert.match(trainersPage, /const alreadyActive=users\.some/);
  assert.match(trainersPage, /String\(user\.status\?\?""\)==="active"/);
  assert.match(trainersPage, /includes\("trainer"\)/);
  assert.match(trainersPage, /L’accès formateur est déjà actif/);
});

test("manual trainer creation reuses a still-valid pending trainer invitation", () => {
  assert.match(trainersPage, /const pendingInvitation=invitations\.some/);
  assert.match(trainersPage, /invitation\.status==="pending"/);
  assert.match(trainersPage, /roles\.includes\("trainer"\)/);
  assert.match(trainersPage, /expiresAt>now/);
  assert.match(trainersPage, /Une invitation formateur active existe déjà/);
});

test("trainer invitation UI distinguishes sent, unsent and failed delivery", () => {
  assert.match(trainersPage, /invitationBody\.sent\?/);
  assert.match(trainersPage, /L’email d’accès formateur a été envoyé/);
  assert.match(trainersPage, /L’invitation a été créée, mais l’email n’a pas pu être envoyé/);
  assert.match(trainersPage, /L’accès n’a pas pu être envoyé/);
  assert.match(trainersPage, /invitationBody\.error/);
});
