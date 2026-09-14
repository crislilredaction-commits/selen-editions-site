import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const trainersPage = fs.readFileSync("app/client/daily/formateurs/page.tsx", "utf8");
const trainerFollowupRoute = fs.readFileSync("app/api/client/daily/trainer-followup/route.ts", "utf8");
const invitationsRoute = fs.readFileSync("app/api/client/daily/workspace/invitations/route.ts", "utf8");

test("manual trainer creation provisions canonical trainer workspace access", () => {
  assert.match(trainersPage, /const\s+isCreation\s*=\s*!values\.id/);
  assert.match(trainersPage, /\/api\/client\/daily\/workspace\/invitations/);
  assert.match(trainersPage, /action:\s*"create"[\s\S]*?roles:\s*\["trainer"\][\s\S]*?permission_blocks:\s*\[\]/);
});

test("manual trainer creation does not duplicate an active trainer access", () => {
  assert.match(trainersPage, /const\s+alreadyActive\s*=\s*users\.some/);
  assert.match(trainersPage, /String\(user\.status\s*\?\?\s*""\)\s*===\s*"active"/);
  assert.match(trainersPage, /includes\("trainer"\)/);
  assert.match(trainersPage, /L’accès formateur est déjà actif/);
});

test("manual trainer creation reuses a still-valid pending trainer invitation", () => {
  assert.match(trainersPage, /const\s+pendingInvitation\s*=\s*invitations\.some/);
  assert.match(trainersPage, /invitation\.status\s*===\s*"pending"/);
  assert.match(trainersPage, /roles\.includes\("trainer"\)/);
  assert.match(trainersPage, /expiresAt\s*>\s*now/);
  assert.match(trainersPage, /Une invitation formateur active existe déjà/);
});

test("trainer invitation UI distinguishes sent, unsent and failed delivery", () => {
  assert.match(trainersPage, /invitationBody\.sent/);
  assert.match(trainersPage, /L’email d’accès formateur a été envoyé/);
  assert.match(trainersPage, /L’invitation a été créée, mais l’email n’a pas pu être envoyé/);
  assert.match(trainersPage, /L’accès n’a pas pu être envoyé/);
  assert.match(trainersPage, /invitationBody\.error/);
});

test("trainer record can resend secure access through the canonical invitation route", () => {
  assert.match(trainersPage, /Renvoyer l’accès sécurisé/);
  assert.match(trainersPage, /action:\s*"resend"/);
  assert.match(trainersPage, /invitation_id:\s*pendingInvitation\.id/);
  assert.match(invitationsRoute, /if \(action === "resend"\)/);
  assert.match(invitationsRoute, /daily_resend_organisation_invitation/);
  assert.match(invitationsRoute, /sendDailyOrganisationInvitation/);
});

test("dirigeant trainer can resolve the trainer profile by professional email", () => {
  assert.match(trainerFollowupRoute, /normalizedEmail\(item\.professional_email\)\s*===\s*normalizedEmail\(workspace\.user\.email\)/);
  assert.match(trainerFollowupRoute, /workspace\.workspace\.membership\.roles\.includes\("trainer"\)/);
  assert.match(trainerFollowupRoute, /\|\| Boolean\(trainer\)/);
});

test("trainer follow-up remains restricted to explicitly assigned sessions", () => {
  assert.match(trainerFollowupRoute, /trainerIds\(session\.trainer_ids\)\.includes\(context\.trainerProfileId\)/);
  assert.match(trainerFollowupRoute, /trainerIds\(data\.trainer_ids\)\.includes\(trainerProfileId\)/);
  assert.doesNotMatch(trainerFollowupRoute, /trainer_ids[^\n]*length\s*===\s*0[^\n]*all/i);
});
