import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/client/daily/action-center/route.ts", import.meta.url), "utf8");
const dashboardV1 = await readFile(new URL("../components/daily/DailyDashboardOverview.tsx", import.meta.url), "utf8");
const dashboardV2 = await readFile(new URL("../components/daily/DailyDashboardOverviewV2.tsx", import.meta.url), "utf8");
const sessionDetail = await readFile(new URL("../app/client/daily/sessions/[sessionId]/page.tsx", import.meta.url), "utf8");

test("action-center checks onboarding document URLs before emitting document tasks", () => {
  assert.match(route, /insee_document_url,qualiopi_certificate_url,nda_or_bpf_document_url/);
  assert.match(route, /if\(task\.key==="insee"&&onboarding\?\.insee_document_url\)continue;/);
  assert.match(route, /if\(task\.key==="qualiopi_certificate"&&onboarding\?\.qualiopi_certificate_url\)continue;/);
  assert.match(route, /if\(task\.key==="nda_or_bpf"&&onboarding\?\.nda_or_bpf_document_url\)continue;/);
});

test("action-center excludes completed prerequisites ('met', 'validated', etc.)", () => {
  assert.match(route, /if\(!\["met","validated","approved","done"\]\.includes\(String\(enrolment\.prerequisites_status\?\?""\)\)\)/);
});

test("dashboard overview components filter out onboarding tasks if document URLs exist", () => {
  assert.match(dashboardV1, /if \(item\.id\.startsWith\("onboarding:insee"\) \|\| item\.id\.startsWith\("missing-doc:insee"\)\)/);
  assert.match(dashboardV2, /if\(item\.id\.startsWith\("onboarding:insee"\)\|\|item\.id\.startsWith\("missing-doc:insee"\)\)/);
});

test("session detail view considers 'reviewed' and 'met' in completedStatuses for progress counters", () => {
  assert.match(sessionDetail, /const completedStatuses = \["completed", "validated", "approved", "done", "reviewed", "met"\];/);
});
