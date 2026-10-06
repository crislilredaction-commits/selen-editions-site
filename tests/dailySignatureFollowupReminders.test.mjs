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
  assert.match(helper, /followup_stage: urgent \? DAILY_SIGNATURE_URGENT_STAGE : DAILY_SIGNATURE_J3_STAGE/);
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

test("l'exécuteur J+3/J+6 est protégé, idempotent et trace chaque email", () => {
  assert.match(automationRoute, /DAILY_AUTOMATION_SECRET/);
  assert.match(automationRoute, /CRON_SECRET/);
  assert.match(automationRoute, /url\.searchParams\.get\("execute"\) === "1"/);
  assert.match(automationRoute, /DAILY_SIGNATURE_J3_STAGE/);
  assert.match(automationRoute, /DAILY_SIGNATURE_J6_STAGE/);
  assert.match(automationRoute, /convention_signature_followup/);
  assert.match(automationRoute, /prepareDailySignatureFollowupEmail/);
  assert.match(automationRoute, /sendDailySignatureFollowup/);
  assert.match(automationRoute, /idempotencyKey: `daily-signature-followup\/\$\{signatureId\}\/\$\{currentStage\}`/);
  assert.match(automationRoute, /\.update\(\{ status: "draft" \}\)/);
  assert.match(automationRoute, /\.eq\("status", sourceStatus\)/);
  assert.match(automationRoute, /provider_message_id/);
});

test("après J+3, le même rappel programme automatiquement J+6 puis une tâche agent à J+9", () => {
  assert.match(helper, /J6_MS = 6 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(helper, /J9_MS = 9 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(helper, /DAILY_SIGNATURE_J6_STAGE = "automatic_email_j6"/);
  assert.match(helper, /DAILY_SIGNATURE_J9_STAGE = "phone_call_j9"/);
  assert.match(helper, /Relance email automatique J\+6/);
  assert.match(helper, /Appel téléphonique agent J\+9/);
  assert.match(helper, /Appeler le client si la signature est toujours absente/);
  assert.match(automationRoute, /moveDailySignatureReminderToNextStage/);
  assert.doesNotMatch(automationRoute, /phone\.|twilio|callClient|makeCall/i);
});

test("un début avant la prochaine relance crée une tâche urgente sans email anticipé", () => {
  assert.match(helper, /DAILY_SIGNATURE_URGENT_STAGE = "agent_urgent_before_start"/);
  assert.match(helper, /startsBefore\(session\?\.start_date, j3DueAt\)/);
  assert.match(helper, /startsBefore\(input\.sessionStartDate, nextDueAt\)/);
  assert.match(helper, /Contacter immédiatement le signataire et sécuriser la signature/);
  assert.match(helper, /status: "ready"/);
  assert.match(helper, /action_href: `\/agent\/daily\/session-dossiers\/\$\{encodeURIComponent\(input\.sessionId\)\}\/followup`/);
  assert.match(automationRoute, /\[DAILY_SIGNATURE_J3_STAGE, DAILY_SIGNATURE_J6_STAGE\]/);
});

test("l'invitation et les deux relances utilisent une clé transport stable", () => {
  assert.match(sendRoute, /daily-signature-invitation\/\$\{signature\.id\}/);
  assert.match(automationRoute, /daily-signature-followup\/\$\{signatureId\}\/\$\{currentStage\}/);
  assert.match(automationRoute, /\["queued", "sent", "delivered", "failed"\]/);
});

test("une signature réelle clôt toute la séquence sans transformer une consultation en signature", () => {
  assert.match(signatureRoute, /status: "signed"/);
  assert.match(signatureRoute, /resolveDailySignatureFollowupReminder/);
  assert.match(helper, /status: "resolved"/);
  assert.doesNotMatch(signatureRoute, /viewed_at:[^\n]*resolveDailySignatureFollowupReminder/);
});
