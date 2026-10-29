import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/20261012213000_sync_materialized_prerequisite_status.sql", import.meta.url), "utf8");
const id = (x) => "00000000-0000-4000-8000-" + String(x).padStart(12, "0");
const key = "a".repeat(64);

test("matérialisation : seules les preuves complètes et vérifiées retirent la tâche prérequis", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
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
  await db.exec(migration);
  const contract = JSON.stringify({
    version: 1, mode: "required",
    participants: [{index: 0, key}],
    requirements: [{id:"diploma", label:"Diplôme", required:true}, {id:"optional",label:"Pièce facultative",required:false}],
  });
  await db.query("insert into public.daily_formation_registration_requests values ($1,$2,'accepted')", [id(1),contract]);
  await db.query("insert into public.daily_session_enrolments values ($1,'not_reviewed'),($2,'not_met')", [id(2),id(3)]);
  await db.query("insert into public.daily_prerequisite_evidence values ($1,null,$2,'diploma','Diplôme',$3,'submitted')",[id(1),key,id(4)]);
  await db.query("insert into public.daily_registration_request_enrolments values ($1,$2,$3)",[id(5),id(1),id(2)]);
  const status = async (enrolment) => (await db.query("select prerequisites_status from public.daily_session_enrolments where id=$1",[enrolment])).rows[0].prerequisites_status;
  assert.equal(await status(id(2)), "not_reviewed");
  await db.query("update public.daily_prerequisite_evidence set status='verified' where registration_request_id=$1",[id(1)]);
  await db.query("update public.daily_registration_request_enrolments set enrolment_id=$1 where id=$2",[id(2),id(5)]);
  assert.equal(await status(id(2)), "met");
  await db.query("update public.daily_registration_request_enrolments set enrolment_id=$1 where id=$2",[id(3),id(5)]);
  assert.equal(await status(id(3)), "not_met");
});

test("plusieurs participants : aucune clôture si une preuve obligatoire manque", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.daily_formation_registration_requests (id uuid primary key, prerequisite_contract jsonb, decision_status text);
    create table public.daily_session_enrolments (id uuid primary key, prerequisites_status text);
    create table public.daily_prerequisite_evidence (registration_request_id uuid, registration_response_id uuid, participant_key text, requirement_id text, requirement_label text, document_id uuid, status text);
    create table public.daily_registration_request_enrolments (id uuid primary key, registration_request_id uuid, enrolment_id uuid);
  `);
  await db.exec(migration);
  const secondKey = "b".repeat(64);
  const contract = JSON.stringify({version:1,mode:"required",participants:[{index:0,key},{index:1,key:secondKey}],requirements:[{id:"diploma",label:"Diplôme",required:true}]});
  await db.query("insert into public.daily_formation_registration_requests values ($1,$2,'accepted')",[id(11),contract]);
  await db.query("insert into public.daily_session_enrolments values ($1,'not_reviewed')",[id(12)]);
  await db.query("insert into public.daily_prerequisite_evidence values ($1,null,$2,'diploma','Diplôme',$3,'verified')",[id(11),key,id(14)]);
  await db.query("insert into public.daily_registration_request_enrolments values ($1,$2,$3)",[id(15),id(11),id(12)]);
  const status = async () => (await db.query("select prerequisites_status from public.daily_session_enrolments where id=$1",[id(12)])).rows[0].prerequisites_status;
  assert.equal(await status(),"not_reviewed");
  await db.query("insert into public.daily_prerequisite_evidence values ($1,null,$2,'diploma','Diplôme',$3,'verified')",[id(11),secondKey,id(16)]);
  await db.query("update public.daily_registration_request_enrolments set enrolment_id=$1 where id=$2",[id(12),id(15)]);
  assert.equal(await status(),"met");
});
