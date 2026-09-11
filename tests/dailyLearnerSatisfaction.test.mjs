import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("../app/api/daily-portal/[token]/learner-satisfaction/route.ts", import.meta.url);
const helperPath = new URL("../lib/daily/endOfTraining.ts", import.meta.url);

const [route, helper] = await Promise.all([readFile(routePath, "utf8"), readFile(helperPath, "utf8")]);

test("learner satisfaction is restricted to active learner portal access", () => {
  assert.match(route, /access\.portal_type !== "learner"/);
  assert.match(route, /\["revoked", "expired"\]/);
  assert.match(route, /\(declined,cancelled,abandoned\)/);
});

test("selen quiz satisfaction opens only after the canonical assessment response", () => {
  assert.match(route, /daily_learning_assessment_responses/);
  assert.match(route, /getLearnerSatisfactionAvailability/);
  assert.match(helper, /mode === "selen_quiz"/);
  assert.match(helper, /available: assessmentSubmitted/);
  assert.match(helper, /reason: assessmentSubmitted \? "assessment_submitted" : "assessment_required"/);
});

test("external assessment satisfaction opens two hours before the final Paris slot", () => {
  assert.match(route, /daily_attendance_slots/);
  assert.match(route, /slot_date,ends_at/);
  assert.match(helper, /timeZone: "Europe\/Paris"/);
  assert.match(helper, /slotEnd\.getTime\(\) - 2 \* 60 \* 60 \* 1000/);
  assert.match(helper, /reason: "trainer_managed_h_minus_2"/);
});

test("learner satisfaction is unique per enrolment and cannot be submitted early", () => {
  assert.match(route, /if \(resolved\.feedback\).*status: 409/);
  assert.match(route, /if \(!resolved\.availability\.available\)/);
  assert.match(route, /status: 403/);
  assert.match(route, /insertError\?\.code === "23505"/);
});

test("learner satisfaction stores the canonical response with bounded ratings", () => {
  assert.match(route, /Number\.isInteger\(parsed\) && parsed >= 1 && parsed <= 5/);
  assert.match(route, /overall_rating, true/);
  assert.match(route, /objectives_rating, true/);
  assert.match(route, /daily_learner_feedback_responses/);
  assert.match(route, /enrolment_id: resolved\.enrolment\.id/);
});

test("useful learner satisfaction feedback feeds the canonical session follow-up", () => {
  assert.match(route, /daily_session_followup_entries/);
  assert.match(route, /entry_type: "note"/);
  assert.match(route, /level: needsAttention \? "attention" : "info"/);
  assert.match(route, /status: needsAttention \? "open" : "resolved"/);
  assert.match(route, /enrolment_id: resolved\.enrolment\.id/);
  assert.match(route, /author_role: "Apprenant"/);
  assert.match(route, /resolved_at: needsAttention \? null : created\.submitted_at/);
});
