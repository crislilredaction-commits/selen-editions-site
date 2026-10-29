import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/client/daily/signature-invitations/send/route.ts", import.meta.url), "utf8");
const summary = await readFile(new URL("../lib/server/dailySessionFollowupSummary.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../components/daily/DailySessionFollowupSummary.tsx", import.meta.url), "utf8");

test("l'invitation réserve la preuve avant l'envoi et ne marque sent qu'après succès", () => {
  const reserve = route.indexOf('.from("daily_communications")');
  const send = route.indexOf("sendDailySignatureInvitation(emailInput)");
  const sentStatus = route.indexOf('status: "sent"', send);
  assert.ok(reserve >= 0 && send > reserve && sentStatus > send);
  assert.match(route, /provider_message_id: sent\.message\.providerMessageId/);
  assert.match(route, /sent_at: sentAt/);
  assert.match(route, /status: "failed"/);
});

test("l'envoi est idempotent pour une signature déjà queued, sent ou delivered", () => {
  assert.match(route, /communication_type", "convention_signature"/);
  assert.match(route, /contains\("metadata", \{ signature_id: signature\.id \}\)/);
  assert.match(route, /\.in\("status", \["queued", "sent", "delivered"\]\)/);
  assert.match(route, /alreadyRecorded: true/);
});

test("H+72 part uniquement de sent_at et s'éteint sur un état terminal", () => {
  assert.match(summary, /const sentAt = evidence\?\.sent_at \?\? null/);
  assert.match(summary, /72 \* 60 \* 60 \* 1000/);
  assert.match(summary, /"signed", "cancelled", "revoked", "expired"/);
  assert.doesNotMatch(summary, /created_at.*72 \* 60 \* 60 \* 1000/);
  assert.match(component, /Client à relancer : délai de 72 h dépassé sans signature/);
});

test("le suivi sépare envoi, délivrance, consultation et signature", () => {
  assert.match(component, /E-mail : \{emailStatusLabel\(item\)\}/);
  assert.match(component, /Envoi : \{frDateTime\(item\.sent_at\)\}/);
  assert.match(component, /Délivrance : \{frDateTime\(item\.delivered_at\)\}/);
  assert.match(component, /Consultation : \{frDateTime\(item\.viewed_at\)\}/);
  assert.match(component, /Signature : \{frDateTime\(item\.signed_at\)\}/);
});
