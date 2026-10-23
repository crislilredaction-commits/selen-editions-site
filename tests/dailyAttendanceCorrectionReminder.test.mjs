import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [route, emails, page, overview, portal, migration] = await Promise.all([
  "../app/api/client/daily/attendance/reminder/route.ts",
  "../lib/server/dailyAttendanceEmails.ts",
  "../app/client/daily/relances/page.tsx",
  "../app/api/client/daily/attendance/route.ts",
  "../app/api/daily-portal/[token]/attendance/route.ts",
  "../supabase/migrations/20261023183429_daily_attendance_correction_request_idempotency.sql",
].map((path) => readFile(new URL(path, import.meta.url), "utf8")));

test("AR1 distingue une correction rejetée d'une relance générique", () => {
  assert.match(route, /review\.state === "rejected"/);
  assert.match(route, /communication_type: correction \? "attendance_correction_request" : "attendance_reminder"/);
  assert.match(route, /review_version: String\(correction\.version\)/);
  assert.match(route, /kind: correction \? "correction" : "reminder"/);
});

test("AR1 réserve une seule demande active par version de rejet", () => {
  assert.match(migration, /create unique index if not exists daily_attendance_correction_request_active_unique/);
  assert.match(migration, /metadata ->> 'attendance_slot_id'/);
  assert.match(migration, /metadata ->> 'review_version'/);
  assert.match(migration, /status in \('queued', 'sent', 'delivered'\)/);
  assert.match(migration, /communication_type = 'attendance_correction_request'/);
});

test("AR1 conserve le motif et propose un lien personnel tardif utilisable", () => {
  assert.match(emails, /prepareDailyAttendanceCorrection/);
  assert.match(emails, /Motif indiqué par l’organisme de formation/);
  assert.match(emails, /escapeHtml\(input\.rejectionReason\)/);
  assert.match(emails, /date réelle de votre nouvelle transmission sera conservée/i);
  assert.match(route, /date\.setUTCDate\(date\.getUTCDate\(\) \+ 7\)/);
  assert.match(route, /sendDailyAttendanceCorrection\(correctionInput\)/);
});

test("AR1 annule l'envoi si la décision change après la réservation", () => {
  assert.match(route, /correctionBeforeSend\?\.version !== correction\.version/);
  assert.match(route, /failure_reason: "attendance_already_resolved"/);
  assert.match(route, /status: "revoked"/);
});

test("les files Daily et le portail exposent la correction sans rouvrir les preuves en validation", () => {
  assert.match(page, /reviewState !== "awaiting_validation"/);
  assert.match(page, /Envoyer la demande de correction/);
  assert.match(page, /valable sept jours/);
  assert.match(overview, /"attendance_correction_request"/);
  assert.match(portal, /"attendance_correction_request"/);
});

test("une inscription abandonnée ne peut pas recevoir de correction", () => {
  assert.match(route, /\["declined", "cancelled", "abandoned"\]\.includes\(enrolment\.status\)/);
});
