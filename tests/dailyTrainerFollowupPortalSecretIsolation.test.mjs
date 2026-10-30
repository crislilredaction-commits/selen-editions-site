import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/client/daily/trainer-followup/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/client/daily/formateur/suivi-sessions/page.tsx", import.meta.url), "utf8");

test("P0: le suivi formateur ne lit ni ne retourne de liens secrets apprenants", () => {
  assert.doesNotMatch(route, /daily_portal_access_tokens|portalAccess|portalRows|portalError/);
  assert.doesNotMatch(route, /entity_email|entity_name|viewed_at|token_hash/);
  assert.doesNotMatch(page, /portalAccess/);
});

test("P0: le suivi formateur conserve les données utiles avec périmètre OF et session", () => {
  assert.match(route, /getAssignedSession\(context\.admin, context\.organisationId, context\.trainerProfileId, sessionId\)/);
  for (const table of ["daily_session_followup_entries", "daily_session_enrolments", "daily_enrolment_support_needs"]) {
    assert.ok(route.includes('.from("' + table + '")'), table + " doit rester lu");
  }
  assert.match(route, /\.eq\("organisation_id", context\.organisationId\)\.eq\("session_id", sessionId\)/);
  assert.match(route, /return NextResponse\.json\(\{ session, entries: entries \?\? \[\], enrolments: enrolmentRows, supportNeeds: supportNeeds \?\? \[\] \}\)/);
});
