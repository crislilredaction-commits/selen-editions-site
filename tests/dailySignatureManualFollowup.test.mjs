import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/client/daily/signature-invitations/followup/route.ts", import.meta.url), "utf8");
const ui = await readFile(new URL("../components/daily/DailySessionFollowupSummary.tsx", import.meta.url), "utf8");
const email = await readFile(new URL("../lib/server/dailySignatureInvitationEmails.ts", import.meta.url), "utf8");

test("la relance manuelle exige un envoi initial vieux de 72 h", () => {
  assert.match(route, /72 \* 60 \* 60 \* 1000/);
  assert.match(route, /communication_type", "convention_signature"/);
  assert.match(route, /La relance manuelle sera disponible 72 h après l’envoi initial/);
});

test("la relance manuelle est idempotente à court terme", () => {
  assert.match(route, /10 \* 60 \* 1000/);
  assert.match(route, /convention_signature_followup/);
  assert.match(route, /alreadyRecorded: true/);
});

test("une signature terminale ne peut jamais être relancée", () => {
  assert.match(route, /\["signed", "expired", "cancelled", "revoked"\]/);
});

test("le bouton n'apparaît que lorsque H+72 est réellement dû", () => {
  assert.match(ui, /item\.sent_at && item\.needs_followup && !terminal/);
  assert.match(ui, /Relancer la signature/);
  assert.match(ui, /signature-invitations\/followup/);
});

test("la relance email est distinguée de l'invitation initiale", () => {
  assert.match(email, /prepareDailySignatureFollowupEmail/);
  assert.match(email, /Relance ·/);
});
