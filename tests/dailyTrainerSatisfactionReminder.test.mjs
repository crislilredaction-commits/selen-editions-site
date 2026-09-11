import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("../app/api/internal/daily/trainer-satisfaction-reminder-automation/route.ts", import.meta.url);
const emailPath = new URL("../lib/server/dailyTrainerSatisfactionReminderEmails.ts", import.meta.url);

const [route, email] = await Promise.all([readFile(routePath, "utf8"), readFile(emailPath, "utf8")]);

test("trainer satisfaction reminder is restricted to external assessment mode", () => {
  assert.match(route, /learning_assessment_mode === "external"/);
});

test("trainer satisfaction reminder uses the canonical H-2 availability helper", () => {
  assert.match(route, /getLearnerSatisfactionAvailability/);
  assert.match(route, /mode: "external"/);
  assert.match(route, /finalSlotEnd/);
});

test("trainer satisfaction reminder is idempotent per trainer and session", () => {
  assert.match(route, /COMMUNICATION_TYPE = "trainer_satisfaction_reminder"/);
  assert.match(route, /trainer_profile_id/);
  assert.match(route, /already_sent/);
});

test("trainer satisfaction reminder is sent with Resend and recorded", () => {
  assert.match(email, /new Resend/);
  assert.match(route, /status: "queued"/);
  assert.match(route, /status: "sent"/);
  assert.match(route, /provider_message_id/);
});
