import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/client/daily/registration-requests/route.ts", "utf8");
const page = fs.readFileSync("app/client/daily/candidatures/page.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260910181010_add_daily_registration_request_decisions.sql", "utf8");
const notificationMigration = fs.readFileSync("supabase/migrations/20260910181608_daily_registration_request_refusal_notification.sql", "utf8");

test("one OF or trainer agreement is enough", () => {
  assert.match(migration, /p_decision = 'accepted'/);
  assert.match(migration, /decision_status = 'accepted'/);
  assert.match(migration, /accepted_decision_id = v_decision_id/);
  assert.match(page, /Un seul accord OF ou formateur suffit/);
});

test("a refusal routes the request to agent review instead of auto-rejecting", () => {
  assert.match(migration, /decision_status = 'agent_review'/);
  assert.match(migration, /agent_review_requested_at = now\(\)/);
  assert.match(notificationMigration, /Candidature à revoir/);
  assert.match(notificationMigration, /daily_registration_request/);
  assert.doesNotMatch(migration, /decision_status = 'rejected'/);
});

test("trainer decision is restricted to an assigned trainer", () => {
  assert.match(migration, /allowed_trainer_ids/);
  assert.match(migration, /assigned trainer permission required/);
  assert.match(route, /trainerProfileId/);
  assert.match(route, /actor_type/);
});

test("client roles never write the decision table directly", () => {
  assert.match(migration, /revoke all on public\.daily_registration_request_decisions from anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on public\.daily_registration_request_decisions to service_role/);
  assert.match(route, /admin\.rpc\("daily_record_registration_request_decision"/);
});
