import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helper = await readFile(new URL("../lib/server/dailySignatureFollowupReminders.ts", import.meta.url), "utf8");
const sendRoute = await readFile(new URL("../app/api/client/daily/signature-invitations/send/route.ts", import.meta.url), "utf8");
const signatureRoute = await readFile(new URL("../app/api/daily-signature/[token]/route.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260909125000_daily_signature_pending_followups.sql", import.meta.url), "utf8");

test("la relance signature est unique et échue 72 h après le véritable envoi", () => {
  assert.match(helper, /daily:signature:\$\{signatureId\}:pending-72h/);
  assert.match(helper, /72 \* 60 \* 60 \* 1000/);
  assert.match(helper, /input\.sentAt/);
  assert.match(helper, /daily_organisation_assignments/);
  assert.match(helper, /assigned_agent_profile_id/);
});

test("l'envoi réussi programme la relance sans casser la preuve email", () => {
  assert.match(sendRoute, /ensureDailySignatureFollowupReminder/);
  assert.match(sendRoute, /reminderInput\(sentAt\)/);
  assert.match(sendRoute, /followupReminderRecorded/);
  assert.match(sendRoute, /status: "sent"/);
});

test("une signature réelle clôt la relance sans transformer une consultation en signature", () => {
  assert.match(signatureRoute, /status: "signed"/);
  assert.match(signatureRoute, /resolveDailySignatureFollowupReminder/);
  assert.match(helper, /status: "resolved"/);
  assert.doesNotMatch(signatureRoute, /viewed_at:[^\n]*resolveDailySignatureFollowupReminder/);
});

test("la migration est additive sur les valeurs métier autorisées", () => {
  assert.match(migration, /daily_signature_pending_72h/);
  assert.match(migration, /'resolved'::text/);
  assert.doesNotMatch(migration, /drop table|delete from|truncate/i);
});
