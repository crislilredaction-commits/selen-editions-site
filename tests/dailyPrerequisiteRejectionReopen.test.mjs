import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration1 = await readFile(new URL("../supabase/migrations/20261012213000_sync_materialized_prerequisite_status.sql", import.meta.url), "utf8");
const migration2 = await readFile(new URL("../supabase/migrations/20261012221000_resync_existing_prerequisites.sql", import.meta.url), "utf8");
const key = "a".repeat(64);
const id = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");

test("rejet après validation automatique : tâche rouverte sans écraser les décisions manuelles", async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.daily_formation_registration_requests (id uuid primary key, prerequisite_contract jsonb, decision_status text);
    create table public.daily_session_enrolments (id uuid primary key, prerequisites_status text);
    create table public.daily_prerequisite_evidence (registration_request_id uuid, registration_response_id uuid, participant_key text, requirement_id text, requirement_label text, document_id uuid, status text);
    create table public.daily_registration_request_enrolments (id uuid primary key, registration_request_id uuid, enrolment_id uuid);
  `);
  await db.exec(migration1);
  await db.query("insert into public.daily_formation_registration_requests values ($1,$2,'accepted')", [id(1),JSON.stringify({version:1,mode:"required",participants:[{key}],requirements:[{id:"diploma",label:"Diplôme",required:true}]})]);
  await db.query("insert into public.daily_session_enrolments values ($1,'not_reviewed'),($2,'met')", [id(2),id(3)]);
  await db.query("insert into public.daily_prerequisite_evidence values ($1,null,$2,'diploma','Diplôme',$3,'verified')", [id(1),key,id(4)]);
  await db.query("insert into public.daily_registration_request_enrolments values ($1,$2,$3),($4,$2,$5)", [id(5),id(1),id(2),id(6),id(3)]);
  await db.exec(migration2);
  const status = async n => (await db.query("select prerequisites_status from public.daily_session_enrolments where id=$1",[id(n)])).rows[0].prerequisites_status;
  assert.equal(await status(2),"met");
  await db.query("update public.daily_prerequisite_evidence set status='rejected' where document_id=$1",[id(4)]);
  assert.equal(await status(2),"not_reviewed","a rejected mandatory evidence must reopen an automatically completed task");
  assert.equal(await status(3),"met","an independently manually validated enrolment must stay validated");
});
