import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/20261005172000_daily_prerequisite_submission_review.sql", import.meta.url), "utf8");
const optionalMigration = await readFile(new URL("../supabase/migrations/20261009140651_daily_optional_prerequisite_evidence.sql", import.meta.url), "utf8");
const ids = {
  org: "00000000-0000-4000-8000-000000000001",
  formation: "00000000-0000-4000-8000-000000000002",
  session: "00000000-0000-4000-8000-000000000003",
  request: "00000000-0000-4000-8000-000000000004",
  response: "00000000-0000-4000-8000-000000000005",
  document: "00000000-0000-4000-8000-000000000006",
  responseDocument: "00000000-0000-4000-8000-000000000007",
  reviewer: "00000000-0000-4000-8000-000000000008",
  replacementDocument: "00000000-0000-4000-8000-000000000011",
};
const fingerprint = "a".repeat(64);
const replacementFingerprint = "d".repeat(64);
const requirements = [{ id: "diploma", label: "Diplôme", required: true }];

test("PostgreSQL réel : dépôt exact, deux propriétaires, revue immuable et garde d’acceptation", async (t) => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.daily_formations(id uuid primary key, organisation_id uuid not null, prerequisite_mode text, prerequisite_requirements jsonb);
    create table public.daily_sessions(id uuid primary key, formation_id uuid not null references public.daily_formations(id), organisation_id uuid not null);
    create table public.daily_formation_registration_requests(
      id uuid primary key, formation_id uuid not null references public.daily_formations(id), attached_session_id uuid references public.daily_sessions(id),
      response_type text, participants jsonb not null default '[]', respondent_first_name text, respondent_last_name text, respondent_email text,
      status text not null default 'attached', decision_status text not null default 'pending'
    );
    create table public.daily_registration_responses(
      id uuid primary key, session_id uuid not null references public.daily_sessions(id), response_type text, participants jsonb not null default '[]',
      respondent_first_name text, respondent_last_name text, respondent_email text, status text not null default 'submitted'
    );
    create table public.daily_documents(
      id uuid primary key, organisation_id uuid, formation_id uuid, session_id uuid, document_type text, linked_object_type text,
      linked_object_id uuid, bucket text, storage_path text, mime_type text, sha256 text, is_current boolean, status text, metadata jsonb,
      version integer not null default 1, previous_document_id uuid references public.daily_documents(id)
    );
    create table public.daily_prerequisite_evidence(
      id uuid primary key default gen_random_uuid(),
      registration_request_id uuid not null references public.daily_formation_registration_requests(id) on delete cascade,
      participant_index integer not null default 0 check (participant_index >= 0), requirement_id text not null, requirement_label text not null,
      document_id uuid references public.daily_documents(id) on delete set null,
      status text not null default 'awaiting_upload' check (status in ('awaiting_upload','submitted','verified','rejected')),
      submitted_at timestamptz, reviewed_by uuid references auth.users(id) on delete set null, reviewed_at timestamptz, review_comment text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      constraint daily_prerequisite_evidence_unique_requirement unique(registration_request_id,participant_index,requirement_id),
      constraint daily_prerequisite_evidence_submission_consistency check ((status='awaiting_upload' and document_id is null and submitted_at is null) or (status in ('submitted','verified','rejected') and document_id is not null and submitted_at is not null)),
      constraint daily_prerequisite_evidence_review_consistency check ((status in ('awaiting_upload','submitted') and reviewed_by is null and reviewed_at is null) or (status in ('verified','rejected') and reviewed_by is not null and reviewed_at is not null))
    );
  `);
  await db.exec(`begin; ${migration} ${optionalMigration} commit;`);
  await db.exec(`
    create trigger daily_registration_guard_prerequisite_acceptance before update of decision_status on public.daily_formation_registration_requests
      for each row execute function public.guard_daily_registration_prerequisite_acceptance();
  `);
  await db.query("insert into auth.users values ($1)", [ids.reviewer]);
  await db.query("insert into public.daily_formations values ($1,$2,'required',$3)", [ids.formation, ids.org, JSON.stringify(requirements)]);
  await db.query("insert into public.daily_sessions values ($1,$2,$3)", [ids.session, ids.formation, ids.org]);

  const insertDocument = async ({ id, owner, kind, session, submissionFingerprint = fingerprint, current = true, staged = false }) => db.query(`insert into public.daily_documents (
    id,organisation_id,formation_id,session_id,document_type,linked_object_type,linked_object_id,bucket,storage_path,mime_type,sha256,is_current,status,metadata
  ) values ($1,$2,$3,$4,'prerequisite_application_evidence',$5,$6,'documents',$7,'application/pdf',$8,$9,'to_check',$10)`, [
    id, ids.org, ids.formation, session, kind, owner,
    `daily/${ids.org}/prerequisite-applications/${ids.formation}/${owner}/${id}.pdf`, "b".repeat(64), current,
    JSON.stringify({ source: "daily_prerequisite_evidence", submission_fingerprint: submissionFingerprint, staged_replacement: staged, participant_index: 0, requirement_id: "diploma", subject_first_name: "Alice", subject_last_name: "Martin", subject_email: "alice@example.test" }),
  ]);

  await insertDocument({ id: ids.document, owner: ids.request, kind: "registration_request", session: ids.session });
  await db.query(`insert into public.daily_formation_registration_requests (
    id,formation_id,attached_session_id,response_type,participants,respondent_first_name,respondent_last_name,respondent_email,prerequisite_submission_fingerprint
  ) values ($1,$2,$3,'beneficiary','[]','Alice','Martin','alice@example.test',$4)`, [ids.request, ids.formation, ids.session, fingerprint]);
  let evidence = (await db.query("select * from public.daily_prerequisite_evidence where registration_request_id=$1", [ids.request])).rows;
  assert.equal(evidence.length, 1); assert.equal(evidence[0].status, "submitted"); assert.equal(evidence[0].document_id, ids.document);
  await assert.rejects(db.query("update public.daily_formation_registration_requests set decision_status='accepted' where id=$1", [ids.request]), /vérifiés humainement/);
  await db.query("select public.review_daily_prerequisite_evidence($1,$2,'rejected','Pièce illisible',$3)", [evidence[0].id, evidence[0].updated_at, ids.reviewer]);
  await insertDocument({ id: ids.replacementDocument, owner: ids.request, kind: "registration_request", session: ids.session, submissionFingerprint: replacementFingerprint, current: false, staged: true });
  await db.query("select public.replace_daily_prerequisite_evidence_submission('registration_request',$1,$2,$3)", [ids.request, fingerprint, replacementFingerprint]);
  evidence = (await db.query("select * from public.daily_prerequisite_evidence where registration_request_id=$1", [ids.request])).rows;
  assert.equal(evidence[0].status, "submitted"); assert.equal(evidence[0].document_id, ids.replacementDocument); assert.equal(evidence[0].reviewed_by, null);
  const versions = (await db.query("select id,is_current,version,previous_document_id from public.daily_documents where id in ($1,$2) order by id", [ids.document, ids.replacementDocument])).rows;
  assert.deepEqual(versions, [
    { id: ids.document, is_current: false, version: 1, previous_document_id: null },
    { id: ids.replacementDocument, is_current: true, version: 2, previous_document_id: ids.document },
  ]);
  assert.equal((await db.query("select prerequisite_submission_fingerprint from public.daily_formation_registration_requests where id=$1", [ids.request])).rows[0].prerequisite_submission_fingerprint, replacementFingerprint);
  await assert.rejects(db.query("update public.daily_formation_registration_requests set decision_status='accepted' where id=$1", [ids.request]), /vérifiés humainement/);
  await db.query("select public.review_daily_prerequisite_evidence($1,$2,'verified','Pièce corrigée lisible',$3)", [evidence[0].id, evidence[0].updated_at, ids.reviewer]);
  await db.query("update public.daily_formation_registration_requests set decision_status='accepted' where id=$1", [ids.request]);
  evidence = (await db.query("select * from public.daily_prerequisite_evidence where registration_request_id=$1", [ids.request])).rows;
  assert.equal(evidence[0].status, "verified");
  const reviews = (await db.query("select decision,review_comment,reviewed_by from public.daily_prerequisite_evidence_reviews")).rows;
  assert.deepEqual(reviews, [
    { decision: "rejected", review_comment: "Pièce illisible", reviewed_by: ids.reviewer },
    { decision: "verified", review_comment: "Pièce corrigée lisible", reviewed_by: ids.reviewer },
  ]);
  await assert.rejects(db.exec("set role service_role; update public.daily_prerequisite_evidence_reviews set review_comment='altéré'; reset role"), /permission denied/);

  await insertDocument({ id: ids.responseDocument, owner: ids.response, kind: "registration_response", session: ids.session });
  await db.query(`insert into public.daily_registration_responses (
    id,session_id,response_type,participants,respondent_first_name,respondent_last_name,respondent_email,prerequisite_submission_fingerprint
  ) values ($1,$2,'beneficiary','[]','Alice','Martin','alice@example.test',$3)`, [ids.response, ids.session, fingerprint]);
  const responseEvidence = (await db.query("select * from public.daily_prerequisite_evidence where registration_response_id=$1", [ids.response])).rows;
  assert.equal(responseEvidence.length, 1); assert.equal(responseEvidence[0].registration_request_id, null); assert.equal(responseEvidence[0].document_id, ids.responseDocument);

  const extraRequest = "00000000-0000-4000-8000-000000000009";
  const extraDocument = "00000000-0000-4000-8000-000000000010";
  await insertDocument({ id: extraDocument, owner: extraRequest, kind: "registration_request", session: null });
  await db.query(`insert into public.daily_documents (id,organisation_id,formation_id,session_id,document_type,linked_object_type,linked_object_id,bucket,storage_path,mime_type,sha256,is_current,status,metadata)
    values (gen_random_uuid(),$1,$2,null,'prerequisite_application_evidence','registration_request',$3,'documents',$4,'application/pdf',$5,true,'to_check',$6)`, [ids.org, ids.formation, extraRequest, `daily/${ids.org}/prerequisite-applications/${ids.formation}/${extraRequest}/extra.pdf`, "c".repeat(64), JSON.stringify({ source: "daily_prerequisite_evidence", submission_fingerprint: fingerprint, staged_replacement: false, participant_index: 1, requirement_id: "diploma", subject_first_name: "Alice", subject_last_name: "Martin", subject_email: "alice@example.test" })]);
  await assert.rejects(db.query(`insert into public.daily_formation_registration_requests (
    id,formation_id,attached_session_id,response_type,participants,respondent_first_name,respondent_last_name,respondent_email,prerequisite_submission_fingerprint
  ) values ($1,$2,null,'beneficiary','[]','Alice','Martin','alice@example.test',$3)`, [extraRequest, ids.formation, fingerprint]), /inattendue|ne correspond pas exactement/);
  assert.equal((await db.query("select count(*)::int count from public.daily_formation_registration_requests where id=$1", [extraRequest])).rows[0].count, 0);

  const optionalRequest = "00000000-0000-4000-8000-000000000012";
  const optionalDocument = "00000000-0000-4000-8000-000000000013";
  const mixedRequirements = [
    { id: "diploma", label: "Diplôme", required: true },
    { id: "experience", label: "Attestation d’expérience", required: false },
  ];
  await db.query("update public.daily_formations set prerequisite_requirements=$2 where id=$1", [ids.formation, JSON.stringify(mixedRequirements)]);
  await insertDocument({ id: optionalDocument, owner: optionalRequest, kind: "registration_request", session: ids.session });
  await db.query(`insert into public.daily_formation_registration_requests (
    id,formation_id,attached_session_id,response_type,participants,respondent_first_name,respondent_last_name,respondent_email,prerequisite_submission_fingerprint
  ) values ($1,$2,$3,'beneficiary','[]','Alice','Martin','alice@example.test',$4)`, [optionalRequest, ids.formation, ids.session, fingerprint]);
  const optionalEvidence = (await db.query("select * from public.daily_prerequisite_evidence where registration_request_id=$1", [optionalRequest])).rows;
  assert.equal(optionalEvidence.length, 1);
  assert.equal(optionalEvidence[0].requirement_id, "diploma");
  await db.query("select public.review_daily_prerequisite_evidence($1,$2,'verified','Pièce obligatoire lisible',$3)", [optionalEvidence[0].id, optionalEvidence[0].updated_at, ids.reviewer]);
  await db.query("update public.daily_formation_registration_requests set decision_status='accepted' where id=$1", [optionalRequest]);
  assert.equal((await db.query("select decision_status from public.daily_formation_registration_requests where id=$1", [optionalRequest])).rows[0].decision_status, "accepted");
});
