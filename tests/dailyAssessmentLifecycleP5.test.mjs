import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("external evidence is atomically versioned and idempotent", async () => {
  const [route, migration] = await Promise.all([
    read("app/api/client/daily/end-evaluations/evidence/route.ts"),
    read("supabase/migrations/20261008014500_daily_learning_assessment_evidence_versioning.sql"),
  ]);
  assert.match(route, /request_id/);
  assert.match(route, /daily_replace_learning_assessment_evidence/);
  assert.match(route, /replayed: true/);
  assert.match(route, /document_id/);
  assert.match(route, /createSignedUrl/);
  assert.match(migration, /daily_learning_assessment_evidence_current_unique/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /previous_document_id/);
  assert.match(migration, /not in \('archived', 'cancelled'\)/);
});

test("assessment reminders run from the public batch and reject inactive parents", async () => {
  const [cron, automation, migration] = await Promise.all([
    read("app/api/cron/daily-satisfaction/route.ts"),
    read("app/api/internal/daily/assessment-reminder-automation/route.ts"),
    read("supabase/migrations/20261008014500_daily_learning_assessment_evidence_versioning.sql"),
  ]);
  assert.match(cron, /runAssessmentReminderAutomation/);
  assert.match(cron, /assessments/);
  assert.match(automation, /not\("status", "in", "\(archived,cancelled\)"\)/);
  assert.match(automation, /evidenceError\?\.code === "23505"/);
  assert.match(automation, /formateur\/suivi-sessions\?session=/);
  assert.match(migration, /daily_learning_assessment_reminder_active_unique/);
});

test("overview exposes only the current evidence and the UI replaces it explicitly", async () => {
  const [api, page] = await Promise.all([
    read("app/api/client/daily/end-evaluations/route.ts"),
    read("app/client/daily/evaluations/preuves/page.tsx"),
  ]);
  assert.match(api, /document_type", "learning_assessment_evidence"/);
  assert.match(api, /eq\("is_current", true\)/);
  assert.match(api, /not\("status", "in", "\(archived,cancelled\)"\)/);
  assert.match(page, /Preuve actuelle · version/);
  assert.match(page, /Remplacer la preuve actuelle/);
  assert.match(page, /crypto\.randomUUID\(\)/);
});

test("trainer imports share the canonical evidence and structured result", async () => {
  const [route, page, download] = await Promise.all([
    read("app/api/client/daily/trainer-session-workspace/route.ts"),
    read("app/client/daily/formateur/suivi-sessions/page.tsx"),
    read("app/api/client/daily/trainer-session-workspace/document/route.ts"),
  ]);
  assert.match(route, /daily_replace_learning_assessment_evidence/);
  assert.match(route, /documentType[\s\S]*learning_assessment_evidence/);
  assert.match(route, /daily_learning_assessments/);
  assert.match(route, /onConflict: "session_id,enrolment_id"/);
  assert.match(route, /activeDailyEnrolment/);
  assert.match(route, /replayed: true/);
  assert.doesNotMatch(route, /document_type:\s*"external_evaluation"/);
  assert.match(page, /externalEvaluationRequestId/);
  assert.match(download, /learning_assessment_evidence/);
});
