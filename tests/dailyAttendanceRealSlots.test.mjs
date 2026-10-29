import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const attendanceApi = await readFile(new URL("../app/api/client/daily/attendance/route.ts", import.meta.url), "utf8");
const publicApi = await readFile(new URL("../app/api/daily-attendance/[token]/route.ts", import.meta.url), "utf8");
const automation = await readFile(new URL("../app/api/internal/daily/attendance-automation/route.ts", import.meta.url), "utf8");
const attendance = await readFile(new URL("../lib/server/dailyAttendance.ts", import.meta.url), "utf8");

test("P1 prépare les créneaux depuis les horaires réels multi-jours", () => {
  assert.match(attendanceApi, /session\.schedule_blocks/);
  assert.match(attendanceApi, /block\.date/);
  assert.match(attendanceApi, /block\.start/);
  assert.match(attendanceApi, /block\.end/);
  assert.match(attendanceApi, /onConflict: "session_id,slot_key"/);
});

test("P1 ouvre les demandes à l'heure réelle du créneau en Europe Paris", () => {
  assert.match(attendance, /DAILY_ATTENDANCE_TIME_ZONE = "Europe\/Paris"/);
  assert.match(attendance, /attendanceSlotHasStarted/);
  assert.match(automation, /clock\.minutes >= startsAt/);
  assert.equal((publicApi.match(/attendanceSlotHasStarted\(slot\)/g) ?? []).length, 2);
  assert.match(publicApi, /status: 425/);
});

test("P1 exclut toute inscription inactive et conserve l'idempotence", () => {
  for (const status of ["declined", "cancelled", "abandoned", "completed"]) assert.match(publicApi, new RegExp(status));
  assert.match(publicApi, /onConflict: "slot_id,enrolment_id"/);
  assert.match(attendanceApi, /ignoreDuplicates: true/);
});


test("P1 annule les anciens créneaux actifs sans effacer l'historique", () => {
  assert.match(attendanceApi, /obsoleteActiveIds/);
  assert.match(attendanceApi, /\["draft", "open"\]\.includes\(slot\.status\)/);
  assert.match(attendanceApi, /update\(\{ status: "cancelled"/);
  assert.match(attendanceApi, /daily_attendance_access_tokens/);
  assert.match(attendanceApi, /update\(\{ status: "revoked" \}\)/);
  assert.match(attendanceApi, /currentSlots/);
  assert.doesNotMatch(attendanceApi, /delete\(\)/);
});
