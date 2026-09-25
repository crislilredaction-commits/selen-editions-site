import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const helper=await readFile(new URL("../lib/server/dailySignatureFollowupReminders.ts",import.meta.url),"utf8");
const manual=await readFile(new URL("../app/api/client/daily/signature-invitations/followup/route.ts",import.meta.url),"utf8");
const automation=await readFile(new URL("../app/api/internal/daily/signature-followup-automation/route.ts",import.meta.url),"utf8");
const signature=await readFile(new URL("../app/api/daily-signature/[token]/route.ts",import.meta.url),"utf8");

test("signature J+3 crée une tâche agent de relance email",()=>{assert.match(helper,/J3_MS = 3 \* 24/);assert.match(helper,/agent_email_j3/);assert.match(helper,/Relance email agent J\+3/);assert.match(helper,/Relancer le client par email/);});
test("après relance J+3 la même tâche passe à J+6 email",()=>{assert.match(helper,/J6_MS = 6 \* 24/);assert.match(helper,/agent_email_j6/);assert.match(helper,/Deuxième relance email agent J\+6/);assert.match(manual,/moveDailySignatureReminderToJ6Email/);});
test("après relance J+6 la même tâche passe à J+9 appel",()=>{assert.match(helper,/J9_MS = 9 \* 24/);assert.match(helper,/phone_call_j9/);assert.match(helper,/Appel téléphonique agent J\+9/);assert.match(manual,/moveDailySignatureReminderToJ9PhoneCall/);});
test("le job automatique n envoie plus de relance à l apprenant",()=>{assert.doesNotMatch(automation,/sendDailySignatureFollowup/);assert.match(automation,/automaticEmailsSent: 0/);});
test("la signature clôt la séquence",()=>{assert.match(signature,/resolveDailySignatureFollowupReminder/);assert.match(helper,/status: "resolved"/);});
