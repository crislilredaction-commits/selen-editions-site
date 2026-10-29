import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [ofRoute, trainerRoute, portalRoute, ofPage, trainerPage, portalPage, attendancePage] = await Promise.all([
  read("../app/api/client/daily/followup/route.ts"),
  read("../app/api/client/daily/trainer-followup/route.ts"),
  read("../app/api/daily-portal/[token]/followup/route.ts"),
  read("../app/client/daily/suivi/page.tsx"),
  read("../app/client/daily/formateur/suivi-sessions/page.tsx"),
  read("../components/daily/DailyStakeholderWorkspace.tsx"),
  read("../components/daily/DailyAttendanceWorkspace.tsx"),
]);

test("P4 scopes every linked enrolment and rejects every terminal enrolment", () => {
  for (const source of [ofRoute, trainerRoute, portalRoute]) {
    assert.match(source, /\.eq\("organisation_id"/);
    assert.match(source, /\.eq\("session_id"/);
    for (const status of ["cancelled", "declined", "abandoned", "completed"]) assert.match(source, new RegExp(status));
  }
  assert.match(portalRoute, /if \(enrolmentId\)/);
});

test("P4 uses the entry primary key as a retry-safe request id on every writer", () => {
  for (const source of [ofRoute, trainerRoute, portalRoute]) {
    assert.match(source, /request_id/);
    assert.match(source, /id: requestId/);
    assert.match(source, /23505/);
  }
  for (const source of [ofPage, trainerPage, portalPage, attendancePage]) assert.match(source, /request_id/);
});

test("P4 only resolves an open scoped entry with a recorded action and refreshes the checklist", () => {
  for (const source of [ofRoute, trainerRoute, portalRoute]) {
    assert.match(source, /action.*requise|action.*requis|actionTaken/s);
    assert.match(source, /\.eq\("status", "open"\)/);
    assert.match(source, /refreshFollowupChecklist/);
  }
  assert.doesNotMatch(portalRoute, /STATUSES/);
});
