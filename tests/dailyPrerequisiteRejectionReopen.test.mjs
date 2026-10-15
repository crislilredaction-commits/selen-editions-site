import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const initial = await readFile(new URL("../supabase/migrations/20261012213000_sync_materialized_prerequisite_status.sql", import.meta.url), "utf8");
const resync = await readFile(new URL("../supabase/migrations/20261012221000_resync_existing_prerequisites.sql", import.meta.url), "utf8");
const reopen = await readFile(new URL("../supabase/migrations/20261015154500_daily_prerequisite_rejection_reopen.sql", import.meta.url), "utf8");
const uuid = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const keys = ["a".repeat(64), "b".repeat(64)];

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table public.daily_formation_registration_requests (id uuid primary key, prerequisite_contract jsonb, decision_status text);
    create table public.daily_session_enrolments (id uuid primary key, prerequisites_status text);
    create table public.daily_prerequisite_evidence (
      registration_request_id uuid, registration_response_id uuid, participant_key text,
      requirement_id text, requirement_label text, document_id uuid, status text
    );
    create table public.daily_registration_request_enrolments (
      id uuid primary key, registration_request_id uuid, enrolment_id uuid
    );
  `);
  await db.exec(initial);
  await db.exec(resync);
  await db.exec(reopen);
  return db;
}

const contract = JSON.stringify({
  version: 1,
  mode: "required",
  participants: keys.map((key, index) => ({ index, key })),
  requirements: [{ id: "diploma", label: "Diplôme", required: true }],
});

test("rejet : réouverture automatique, historique conservé et nouvelle validation referme", async (t) => {
  const db = await database(); t.after(() => db.close());
  await db.query("insert into public.daily_formation_registration_requests values ($1,$2,'accepted')", [uuid(1), contract]);
  await db.query("insert into public.daily_session_enrolments values ($1,'not_reviewed')", [uuid(2)]);
  await db.query("insert into public.daily_prerequisite_evidence values ($1,null,$2,'diploma','Diplôme',$3,'verified'),($1,null,$4,'diploma','Diplôme',$5,'verified')", [uuid(1), keys[0], uuid(3), keys[1], uuid(4)]);
  await db.query("insert into public.daily_registration_request_enrolments values ($1,$2,$3)", [uuid(5), uuid(1), uuid(2)]);

  const status = async () => (await db.query("select prerequisites_status from public.daily_session_enrolments where id=$1", [uuid(2)])).rows[0].prerequisites_status;
  const events = async () => (await db.query("select event_type,previous_status,new_status from public.daily_prerequisite_status_events where enrolment_id=$1 order by id", [uuid(2)])).rows;
  assert.equal(await status(), "met");
  assert.deepEqual(await events(), [{ event_type: "auto_met", previous_status: "not_reviewed", new_status: "met" }]);

  await db.query("update public.daily_prerequisite_evidence set status='rejected' where document_id=$1", [uuid(3)]);
  assert.equal(await status(), "not_reviewed");
  assert.deepEqual((await events()).map(({ event_type }) => event_type), ["auto_met", "auto_reopened"]);

  await db.query("update public.daily_prerequisite_evidence set status='verified' where document_id=$1", [uuid(3)]);
  assert.equal(await status(), "met");
  assert.deepEqual((await events()).map(({ event_type }) => event_type), ["auto_met", "auto_reopened", "auto_met"]);
});

test("rejet : une preuve de remplacement vérifiée évite la réouverture", async (t) => {
  const db = await database(); t.after(() => db.close());
  const oneParticipantContract = JSON.stringify({ version:1, mode:"required", participants:[{ index:0, key:keys[0] }], requirements:[{ id:"diploma", label:"Diplôme", required:true }] });
  await db.query("insert into public.daily_formation_registration_requests values ($1,$2,'accepted')", [uuid(11), oneParticipantContract]);
  await db.query("insert into public.daily_session_enrolments values ($1,'not_reviewed')", [uuid(12)]);
  await db.query("insert into public.daily_prerequisite_evidence values ($1,null,$2,'diploma','Diplôme',$3,'verified'),($1,null,$2,'diploma','Diplôme',$4,'verified')", [uuid(11), keys[0], uuid(13), uuid(14)]);
  await db.query("insert into public.daily_registration_request_enrolments values ($1,$2,$3)", [uuid(15), uuid(11), uuid(12)]);
  await db.query("update public.daily_prerequisite_evidence set status='rejected' where document_id=$1", [uuid(13)]);
  assert.equal((await db.query("select prerequisites_status from public.daily_session_enrolments where id=$1", [uuid(12)])).rows[0].prerequisites_status, "met");
});

test("rejet : une décision manuelle postérieure n'est jamais rouverte", async (t) => {
  const db = await database(); t.after(() => db.close());
  const oneParticipantContract = JSON.stringify({ version:1, mode:"required", participants:[{ index:0, key:keys[0] }], requirements:[{ id:"diploma", label:"Diplôme", required:true }] });
  await db.query("insert into public.daily_formation_registration_requests values ($1,$2,'accepted')", [uuid(21), oneParticipantContract]);
  await db.query("insert into public.daily_session_enrolments values ($1,'not_reviewed')", [uuid(22)]);
  await db.query("insert into public.daily_prerequisite_evidence values ($1,null,$2,'diploma','Diplôme',$3,'verified')", [uuid(21), keys[0], uuid(23)]);
  await db.query("insert into public.daily_registration_request_enrolments values ($1,$2,$3)", [uuid(24), uuid(21), uuid(22)]);
  await db.query("update public.daily_session_enrolments set prerequisites_status='to_clarify' where id=$1", [uuid(22)]);
  await db.query("update public.daily_session_enrolments set prerequisites_status='met' where id=$1", [uuid(22)]);
  await db.query("update public.daily_prerequisite_evidence set status='rejected' where document_id=$1", [uuid(23)]);
  assert.equal((await db.query("select prerequisites_status from public.daily_session_enrolments where id=$1", [uuid(22)])).rows[0].prerequisites_status, "met");
  assert.deepEqual((await db.query("select event_type from public.daily_prerequisite_status_events where enrolment_id=$1 order by id", [uuid(22)])).rows.map(({ event_type }) => event_type), ["auto_met", "manual_change", "manual_change"]);
});

test("droits : le journal est inaccessible aux rôles publics et disponible au service", async (t) => {
  const db = await database(); t.after(() => db.close());
  const privileges = await db.query(`
    select
      has_table_privilege('anon', 'public.daily_prerequisite_status_events', 'select') as anon_select,
      has_table_privilege('authenticated', 'public.daily_prerequisite_status_events', 'select') as authenticated_select,
      has_table_privilege('service_role', 'public.daily_prerequisite_status_events', 'select') as service_select,
      has_table_privilege('service_role', 'public.daily_prerequisite_status_events', 'insert') as service_insert
  `);
  assert.deepEqual(privileges.rows[0], { anon_select:false, authenticated_select:false, service_select:true, service_insert:true });
});
