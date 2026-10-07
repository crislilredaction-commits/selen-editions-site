import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = await Promise.all([
  "../lib/dailyAttendanceState.ts",
  "../lib/server/dailyAttendanceChecklist.ts",
  "../app/api/internal/daily/attendance-automation/route.ts",
  "../app/api/client/daily/attendance/reminder/route.ts",
  "../app/api/client/daily/trainer-session-workspace/route.ts",
  "../app/client/daily/presences/page.tsx",
  "../components/daily/DailyAttendanceWorkspace.tsx",
  "../supabase/migrations/20261007154500_daily_attendance_communication_idempotency.sql",
].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
const [state, checklist, automation, reminder, trainer, ofPage, portalPage, migration] = files;

test("P2 partage les quatre états métier entre OF et portail", () => {
  for (const label of ["Signé", "Partiel", "Absent", "En attente"]) assert.match(state, new RegExp(label));
  assert.match(ofPage, /dailyAttendanceSummary/);
  assert.match(portalPage, /dailyAttendanceLabel/);
});

test("P2 conserve les preuves papier dans le statut canonique", () => {
  assert.match(trainer, /status:"present"/);
  assert.doesNotMatch(trainer, /status:"signed"/);
  assert.match(trainer, /refreshDailyAttendanceChecklist/);
});

test("P2 exclut les créneaux annulés et retire la tâche devenue sans objet", () => {
  assert.match(checklist, /neq\("status", "cancelled"\)/);
  assert.match(checklist, /not_applicable/);
  assert.match(checklist, /organisation_id/);
});

test("P2 réserve les relances avant tout envoi et empêche les doublons", () => {
  assert.match(automation, /already_reserved/);
  assert.match(automation, /resolved_before_send/);
  assert.match(reminder, /Cette relance est déjà enregistrée/);
  assert.match(migration, /create unique index if not exists/);
  assert.match(migration, /attendance_slot_id/);
});

test("P2 n'envoie aucune relance après traitement de la présence", () => {
  assert.match(automation, /attendanceBeforeSend\?\.status !== "pending"/);
  assert.match(reminder, /attendanceBeforeSend\?\.status !== "pending"/);
  assert.match(reminder, /record\?\.status !== "pending"/);
});

test("P2 expose la traçabilité des relances dans les vues", () => {
  assert.match(ofPage, /dernière/);
  assert.match(portalPage, /reminderCount/);
});
