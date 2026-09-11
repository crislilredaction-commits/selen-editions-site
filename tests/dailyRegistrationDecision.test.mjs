import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/client/daily/registration-requests/route.ts", "utf8");
const page = fs.readFileSync("app/client/daily/candidatures/page.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260910181010_add_daily_registration_request_decisions.sql", "utf8");
const notificationMigration = fs.readFileSync("supabase/migrations/20260910181608_daily_registration_request_refusal_notification.sql", "utf8");
const materializationMigration = fs.readFileSync("supabase/migrations/20260910183336_daily_registration_request_materialization.sql", "utf8");
const duplicateFixMigration = fs.readFileSync("supabase/migrations/20260910183801_daily_registration_materialization_duplicate_request_fix.sql", "utf8");

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

test("accepted candidacy materializes into learners and session enrolments", () => {
  assert.match(materializationMigration, /daily_materialize_registration_request/);
  assert.match(materializationMigration, /insert into public\.daily_learners/);
  assert.match(materializationMigration, /insert into public\.daily_session_enrolments/);
  assert.match(materializationMigration, /'public_form'/);
  assert.match(materializationMigration, /session does not match registration request/);
  assert.match(route, /admin\.rpc\("daily_materialize_registration_request"/);
  assert.match(page, /sans ressaisie/);
});

test("company candidacy supports several participants and reuses canonical enrolments", () => {
  assert.match(materializationMigration, /jsonb_array_elements\(v_participants\)/);
  assert.match(materializationMigration, /where session_id = v_session\.id and learner_id = v_learner_id/);
  assert.match(materializationMigration, /exception when unique_violation/);
  assert.match(materializationMigration, /unique \(registration_request_id, participant_index\)/);
  assert.match(duplicateFixMigration, /unique \(registration_request_id, enrolment_id\)/);
  assert.doesNotMatch(duplicateFixMigration, /unique \(enrolment_id\)/);
});

test("only the OF manager can choose a missing session", () => {
  assert.match(route, /body\.action === "materialize"/);
  assert.match(route, /if \(!access\.isManager\)/);
  assert.match(route, /Seul le responsable de l'organisme peut choisir la session/);
  assert.match(page, /Choisir la session/);
  assert.match(page, /L'organisme choisira la session/);
});

test("already targeted accepted candidacy is materialized immediately", () => {
  assert.match(route, /if \(acceptedRequest\?\.attached_session_id\)/);
  assert.match(route, /p_session_id: acceptedRequest\.attached_session_id/);
  assert.match(page, /Candidature acceptée et inscription créée automatiquement dans la session/);
});

test("materialization remains service-role only", () => {
  assert.match(materializationMigration, /revoke all on function public\.daily_materialize_registration_request\(uuid, uuid\) from public, anon, authenticated/);
  assert.match(materializationMigration, /grant execute on function public\.daily_materialize_registration_request\(uuid, uuid\) to service_role/);
  assert.match(materializationMigration, /alter table public\.daily_registration_request_enrolments enable row level security/);
  assert.match(materializationMigration, /revoke all on table public\.daily_registration_request_enrolments from public, anon, authenticated/);
});
