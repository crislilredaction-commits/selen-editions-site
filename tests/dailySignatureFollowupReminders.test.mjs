import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helper = await readFile(new URL("../lib/server/dailySignatureFollowupReminders.ts", import.meta.url), "utf8");
const sendRoute = await readFile(new URL("../app/api/client/daily/signature-invitations/send/route.ts", import.meta.url), "utf8");
const signatureRoute = await readFile(new URL("../app/api/daily-signature/[token]/route.ts", import.meta.url), "utf8");
const automationRoute = await readFile(new URL("../app/api/internal/daily/signature-followup-automation/route.ts", import.meta.url), "utf8");

// Cette garde est volontairement branchée au build pour valider le lot complet avant fusion.
test("la relance signature reste unique et programme l'email automatique à J+3", () => {
  assert.match(helper, /daily:signature:\$\{signatureId\}:pending-72h/);
  assert.match(helper, /J3_MS = 3 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(helper, /followup_stage: DAILY_SIGNATURE_J3_STAGE/);
  assert.match(helper, /input\.sentAt/);
  assert.match(helper, /daily_organisation_assignments/);
  assert.match(helper, /assigned_agent_profile_id/);
  assert.match(helper, /daily_signature_pending_72h/);
});

test("l'envoi réussi programme la séquence sans casser la preuve email", () => {
  assert.match(sendRoute, /ensureDailySignatureFollowupReminder/);
  assert.match(sendRoute, /reminderInput\(sentAt\)/);
  assert.match(sendRoute, /followupReminderRecorded/);
  assert.match(sendRoute, /status: "sent"/);
  assert.match(helper, /escapeHtml\(bodyText\)/);
});

test("l'exécuteur J+3 est protégé, idempotent et trace l'email", () => {
  assert.match(automationRoute, /DAILY_AUTOMATION_SECRET/);
  assert.match(automationRoute, /url\.searchParams\.get\("execute"\) === "1"/);
  assert.match(automationRoute, /DAILY_SIGNATURE_J3_STAGE/);
  assert.match(automationRoute, /convention_signature_followup/);
  assert.match(automationRoute, /prepareDailySignatureFollowupEmail/);
  assert.match(automationRoute, /sendDailySignatureFollowup/);
  assert.match(automationRoute, /status: "postponed"/);
  assert.match(automationRoute, /\.eq\("status", "ready"\)/);
  assert.match(automationRoute, /provider_message_id/);
});

test("après l'email J+3, le même rappel devient une alerte d'appel humain à J+6", () => {
  assert.match(helper, /J6_MS = 6 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(helper, /DAILY_SIGNATURE_J6_STAGE = "phone_call_j6"/);
  assert.match(helper, /Appel téléphonique agent J\+6/);
  assert.match(helper, /Appeler le client si la signature est toujours absente/);
  assert.match(automationRoute, /moveDailySignatureReminderToPhoneCall/);
  assert.doesNotMatch(automationRoute, /phone\.|twilio|callClient|makeCall/i);
});

test("une signature réelle clôt toute la séquence sans transformer une consultation en signature", () => {
  assert.match(signatureRoute, /status: "signed"/);
  assert.match(signatureRoute, /resolveDailySignatureFollowupReminder/);
  assert.match(helper, /status: "resolved"/);
  assert.doesNotMatch(signatureRoute, /viewed_at:[^\n]*resolveDailySignatureFollowupReminder/);
});
