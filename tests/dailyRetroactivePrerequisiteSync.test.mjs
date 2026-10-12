import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const initial = await readFile(new URL("../supabase/migrations/20261012213000_sync_materialized_prerequisite_status.sql", import.meta.url), "utf8");
const followup = await readFile(new URL("../supabase/migrations/20261012221000_resync_existing_prerequisites.sql", import.meta.url), "utf8");
const uuid = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const keys = ["a".repeat(64), "b".repeat(64)];

test("dossiers existants : validation complète resynchronisée, validation partielle ignorée", async (t) => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.daily_formation_registration_requests (id uuid primary key, prerequisite_contract jsonb, decision_status text);
    create table public.daily_session_enrolments (id uuid primary key, prerequisites_status text);
    create table public.daily_prerequisite_evidence (
      registration_request_id uuid, registration_response_id uuid, participant_key text,
      requirement_id text, requirement_label text, document_id uuid, status text
    );
    create table public.daily_registration_request_enrolments (id uuid primary key, registration_request_id uuid, enrolment_id uuid);
  `);
  await db.exec(initial);
  const contract = JSON.stringify({
    version:1, mode:"required", participants:keys.map((key,index)=>({index,key})),
    requirements:[{id:"diploma",label:"Diplôme",required:true}],
  });
  await db.query("insert into public.daily_formation_registration_requests values ($1,$2,'accepted')", [uuid(1),contract]);
  await db.query("insert into public.daily_session_enrolments values ($1,'not_reviewed')", [uuid(2)]);
  await db.query("insert into public.daily_prerequisite_evidence values ($1,null,$2,'diploma','Diplôme',$3,'verified'),($1,null,$4,'diploma','Diplôme',$5,'submitted')", [uuid(1),keys[0],uuid(3),keys[1],uuid(4)]);
  await db.query("insert into public.daily_registration_request_enrolments values ($1,$2,$3)", [uuid(5),uuid(1),uuid(2)]);
  const status = async () => (await db.query("select prerequisites_status from public.daily_session_enrolments where id=$1",[uuid(2)])).rows[0].prerequisites_status;
  assert.equal(await status(),"not_reviewed");
  await db.exec(followup);
  assert.equal(await status(),"not_reviewed", "backfill must not close incomplete dossier");
  await db.query("update public.daily_prerequisite_evidence set status='verified' where registration_request_id=$1 and participant_key=$2",[uuid(1),keys[1]]);
  assert.equal(await status(),"met", "last verified mandatory evidence closes old enrolment task");
});

test("les statuts manuels non satisfaits ne sont jamais écrasés", async (t) => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.daily_formation_registration_requests (id uuid primary key, prerequisite_contract jsonb, decision_status text);
    create table public.daily_session_enrolments (id uuid primary key, prerequisites_status text);
    create table public.daily_prerequisite_evidence (registration_request_id uuid, registration_response_id uuid, participant_key text, requirement_id text, requirement_label text, document_id uuid, status text);
    create table public.daily_registration_request_enrolments (id uuid primary key, registration_request_id uuid, enrolment_id uuid);
  `);
  await db.exec(initial);
  await db.query("insert into public.daily_formation_registration_requests values ($1,$2,'accepted')", [uuid(11),JSON.stringify({version:1,mode:"required",participants:[{index:0,key:keys[0]}],requirements:[{id:"diploma",label:"Diplôme",required:true}]})]);
  await db.query("insert into public.daily_session_enrolments values ($1,'not_met')",[uuid(12)]);
  await db.query("insert into public.daily_prerequisite_evidence values ($1,null,$2,'diploma','Diplôme',$3,'verified')",[uuid(11),keys[0],uuid(13)]);
  await db.query("insert into public.daily_registration_request_enrolments values ($1,$2,$3)",[uuid(14),uuid(11),uuid(12)]);
  await db.exec(followup);
  assert.equal((await db.query("select prerequisites_status from public.daily_session_enrolments where id=$1",[uuid(12)])).rows[0].prerequisites_status,"not_met");
});

// Regression coverage for a later rejection is tracked in the follow-up migration.
