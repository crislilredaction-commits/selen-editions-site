import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("la fiche formateur expose le renvoi d’accès sécurisé", async () => {
  const source = await read("app/client/daily/formateurs/page.tsx");

  assert.match(source, /Renvoyer l’accès sécurisé/);
  assert.match(source, /action:\s*"resend"/);
  assert.match(source, /invitation_id:\s*pendingInvitation\.id/);
  assert.match(source, /action:\s*"create"/);
  assert.match(source, /roles:\s*\["trainer"\]/);
  assert.match(source, /\/api\/client\/daily\/workspace\/invitations/);
});

test("le renvoi d’accès réutilise le mécanisme central d’invitation", async () => {
  const source = await read("app/api/client/daily/workspace/invitations/route.ts");

  assert.match(source, /if \(action === "resend"\)/);
  assert.match(source, /daily_resend_organisation_invitation/);
  assert.match(source, /p_invitation_id:\s*invitationId/);
  assert.match(source, /sendDailyOrganisationInvitation/);
});
