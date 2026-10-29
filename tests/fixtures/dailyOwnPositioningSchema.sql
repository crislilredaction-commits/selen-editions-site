-- Read-only snapshot of the relevant live Selen column/check/unique definitions.
-- External foreign keys are omitted: this fixture runs only in isolated PGlite.
create role anon; create role authenticated; create role service_role;
create table public.daily_documents (
  "id" uuid default gen_random_uuid() not null,
  "organisation_id" uuid not null,
  "document_type" text not null,
  "linked_object_type" text,
  "linked_object_id" uuid,
  "version" integer not null,
  "status" text default 'draft'::text not null,
  "logical_name" text not null,
  "bucket" text not null,
  "storage_path" text not null,
  "mime_type" text,
  "size_bytes" bigint,
  "sha256" text,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "published_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "is_current" boolean default true not null,
  "previous_document_id" uuid,
  "validated_by" uuid,
  "validated_at" timestamp with time zone,
  "signed_at" timestamp with time zone,
  "metadata" jsonb default '{}'::jsonb not null,
  "formation_id" uuid,
  "session_id" uuid,
  "learner_id" uuid,
  "enrolment_id" uuid,
  constraint "daily_documents_assessment_evidence_triplet_check" CHECK (((document_type <> ALL (ARRAY['learning_assessment_evidence'::text, 'positioning_evidence'::text])) OR ((formation_id IS NOT NULL) AND (session_id IS NOT NULL) AND (learner_id IS NOT NULL) AND (enrolment_id IS NOT NULL)))),
  constraint "daily_documents_pkey" PRIMARY KEY (id),
  constraint "daily_documents_sha256_check" CHECK (((sha256 IS NULL) OR (sha256 ~ '^[A-Fa-f0-9]{64}$'::text))),
  constraint "daily_documents_size_positive_check" CHECK (((size_bytes IS NULL) OR (size_bytes >= 0))),
  constraint "daily_documents_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'to_check'::text, 'to_validate'::text, 'validated'::text, 'published'::text, 'signed'::text, 'correction_requested'::text, 'active'::text, 'archived'::text]))),
  constraint "daily_documents_storage_path_unique" UNIQUE (storage_path),
  constraint "daily_documents_version_positive_check" CHECK ((version > 0))
);
create table public.daily_formation_registration_requests (
  "id" uuid default gen_random_uuid() not null,
  "formation_id" uuid not null,
  "user_id" uuid not null,
  "response_type" text not null,
  "respondent_first_name" text,
  "respondent_last_name" text,
  "respondent_email" text,
  "company_name" text,
  "participants" jsonb default '[]'::jsonb not null,
  "need_answers" jsonb default '{}'::jsonb not null,
  "positioning_answers" jsonb default '{}'::jsonb not null,
  "adaptation_needed" boolean default false not null,
  "status" text default 'to_attach'::text not null,
  "submitted_at" timestamp with time zone default now() not null,
  "attached_session_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "signature_consent_text" text,
  "signature_data" text,
  "signature_proof_hash" text,
  "signature_signed_at" timestamp with time zone,
  "signature_ip_address" text,
  "signature_user_agent" text,
  "decision_status" text default 'pending'::text not null,
  "accepted_at" timestamp with time zone,
  "accepted_decision_id" uuid,
  "agent_review_requested_at" timestamp with time zone,
  "materialized_at" timestamp with time zone,
  "agent_analysis_summary" jsonb,
  "agent_analysis_completed_at" timestamp with time zone,
  "agent_analysis_completed_by" uuid,
  "prerequisites_validated" boolean,
  "refused_at" timestamp with time zone,
  constraint "daily_formation_registration_requests_decision_status_check" CHECK ((decision_status = ANY (ARRAY['pending'::text, 'ready_for_of'::text, 'accepted'::text, 'refused'::text]))),
  constraint "daily_formation_registration_requests_pkey" PRIMARY KEY (id),
  constraint "daily_formation_registration_requests_response_type_check" CHECK ((response_type = ANY (ARRAY['beneficiary'::text, 'company'::text]))),
  constraint "daily_formation_registration_requests_status_check" CHECK ((status = ANY (ARRAY['to_attach'::text, 'attached'::text, 'archived'::text])))
);
create table public.daily_formations (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "title" text not null,
  "global_objective" text not null,
  "target_audience" text not null,
  "prerequisites" text not null,
  "duration_hours" numeric(8,2) not null,
  "duration_days" numeric(8,2) not null,
  "modality" text not null,
  "modality_details" text not null,
  "access_delays" text not null,
  "registration_methods" text not null,
  "price" text not null,
  "detailed_program" text not null,
  "accessibility" text not null,
  "disability_referent" text,
  "pedagogical_resources" text not null,
  "evaluation_methods" text not null,
  "result_beneficiary_count" integer,
  "result_satisfaction_rate" numeric(5,2),
  "result_success_rate" numeric(5,2),
  "results_pending" boolean default false not null,
  "contact_phone" text not null,
  "contact_email" text not null,
  "contact_website" text,
  "updated_visible_at" date default CURRENT_DATE not null,
  "status" text default 'draft'::text not null,
  "validation_note" text,
  "version" integer default 1 not null,
  "previous_version_id" uuid,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "positioning_mode" text default 'off_platform'::text not null,
  "positioning_questions" jsonb default '[]'::jsonb not null,
  "detailed_program_document_url" text,
  "public_registration_token" text,
  "public_registration_enabled" boolean default true not null,
  "spontaneous_registration_task_status" text default 'none'::text not null,
  "organisation_id" uuid not null,
  "learning_objectives" jsonb default '[]'::jsonb not null,
  "pedagogical_methods" text default ''::text not null,
  "allowed_trainer_ids" jsonb default '[]'::jsonb not null,
  "learning_assessment_mode" text default 'external'::text not null,
  "learning_assessment_instructions" text,
  "learning_assessment_questions" jsonb default '[]'::jsonb not null,
  "positioning_questionnaire_document_url" text,
  "agent_review_signaled_at" timestamp with time zone,
  "creation_mode" text default 'selen_form'::text not null,
  "prerequisite_mode" text default 'none'::text not null,
  "prerequisite_requirements" jsonb default '[]'::jsonb not null,
  constraint "daily_formations_creation_mode_check" CHECK ((creation_mode = ANY (ARRAY['program_import'::text, 'selen_form'::text]))),
  constraint "daily_formations_learning_assessment_mode_check" CHECK ((learning_assessment_mode = ANY (ARRAY['external'::text, 'selen_quiz'::text]))),
  constraint "daily_formations_learning_assessment_questions_array_check" CHECK ((jsonb_typeof(learning_assessment_questions) = 'array'::text)),
  constraint "daily_formations_modality_check" CHECK ((modality = ANY (ARRAY['presentiel'::text, 'distanciel'::text, 'mixte'::text]))),
  constraint "daily_formations_pkey" PRIMARY KEY (id),
  constraint "daily_formations_positioning_mode_check" CHECK ((positioning_mode = ANY (ARRAY['off_platform'::text, 'selen'::text]))),
  constraint "daily_formations_prerequisite_mode_check" CHECK ((prerequisite_mode = ANY (ARRAY['none'::text, 'required'::text]))),
  constraint "daily_formations_prerequisite_requirements_array_check" CHECK ((jsonb_typeof(prerequisite_requirements) = 'array'::text)),
  constraint "daily_formations_prerequisite_requirements_consistency_check" CHECK ((((prerequisite_mode = 'none'::text) AND (jsonb_array_length(prerequisite_requirements) = 0)) OR ((prerequisite_mode = 'required'::text) AND (jsonb_array_length(prerequisite_requirements) > 0)))),
  constraint "daily_formations_spontaneous_registration_task_status_check" CHECK ((spontaneous_registration_task_status = ANY (ARRAY['none'::text, 'to_attach'::text, 'attached'::text, 'archived'::text]))),
  constraint "daily_formations_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'validated'::text, 'correction_requested'::text, 'archived'::text])))
);
create table public.daily_learners (
  "id" uuid default gen_random_uuid() not null,
  "organisation_id" uuid not null,
  "first_name" text not null,
  "last_name" text not null,
  "email" text,
  "phone" text,
  "company_name" text,
  "job_title" text,
  "status" text default 'active'::text not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "daily_learners_check" CHECK (((btrim(first_name) <> ''::text) AND (btrim(last_name) <> ''::text))),
  constraint "daily_learners_email_check" CHECK (((email IS NULL) OR (btrim(email) <> ''::text))),
  constraint "daily_learners_pkey" PRIMARY KEY (id),
  constraint "daily_learners_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);
create table public.daily_registration_request_enrolments (
  "id" uuid default gen_random_uuid() not null,
  "registration_request_id" uuid not null,
  "participant_index" integer not null,
  "participant_email" text not null,
  "learner_id" uuid not null,
  "enrolment_id" uuid not null,
  "materialized_at" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "daily_registration_request_en_registration_request_id_part_key1" UNIQUE (registration_request_id, participant_email),
  constraint "daily_registration_request_en_registration_request_id_parti_key" UNIQUE (registration_request_id, participant_index),
  constraint "daily_registration_request_enrolments_participant_email_check" CHECK ((btrim(participant_email) <> ''::text)),
  constraint "daily_registration_request_enrolments_participant_index_check" CHECK ((participant_index >= 0)),
  constraint "daily_registration_request_enrolments_pkey" PRIMARY KEY (id),
  constraint "daily_registration_request_enrolments_registration_request_id_e" UNIQUE (registration_request_id, enrolment_id)
);
create table public.daily_registration_responses (
  "id" uuid default gen_random_uuid() not null,
  "session_id" uuid not null,
  "user_id" uuid not null,
  "response_type" text not null,
  "respondent_first_name" text,
  "respondent_last_name" text,
  "respondent_email" text,
  "company_name" text,
  "participants" jsonb default '[]'::jsonb not null,
  "need_answers" jsonb default '{}'::jsonb not null,
  "positioning_answers" jsonb default '{}'::jsonb not null,
  "adaptation_needed" boolean default false not null,
  "status" text default 'submitted'::text not null,
  "submitted_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "signature_consent_text" text,
  "signature_data" text,
  "signature_proof_hash" text,
  "signature_signed_at" timestamp with time zone,
  "signature_ip_address" text,
  "signature_user_agent" text,
  constraint "daily_registration_responses_pkey" PRIMARY KEY (id),
  constraint "daily_registration_responses_response_type_check" CHECK ((response_type = ANY (ARRAY['beneficiary'::text, 'company'::text]))),
  constraint "daily_registration_responses_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text])))
);
create table public.daily_session_enrolments (
  "id" uuid default gen_random_uuid() not null,
  "organisation_id" uuid not null,
  "session_id" uuid not null,
  "learner_id" uuid not null,
  "status" text default 'pending'::text not null,
  "funding_type" text default 'unknown'::text not null,
  "funding_organisation" text,
  "company_name" text,
  "company_contact_name" text,
  "company_contact_email" text,
  "positioning_status" text default 'not_started'::text not null,
  "prerequisites_status" text default 'not_reviewed'::text not null,
  "source" text default 'manual'::text not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "contracting_party_type" text,
  constraint "daily_session_enrolments_company_party_required_check" CHECK (((contracting_party_type IS DISTINCT FROM 'company'::text) OR (NULLIF(btrim(company_name), ''::text) IS NOT NULL))),
  constraint "daily_session_enrolments_contracting_party_type_check" CHECK ((contracting_party_type = ANY (ARRAY['individual'::text, 'company'::text]))),
  constraint "daily_session_enrolments_funding_type_check" CHECK ((funding_type = ANY (ARRAY['employer'::text, 'self_funded'::text, 'opco'::text, 'public_funder'::text, 'other'::text, 'unknown'::text]))),
  constraint "daily_session_enrolments_pkey" PRIMARY KEY (id),
  constraint "daily_session_enrolments_positioning_status_check" CHECK ((positioning_status = ANY (ARRAY['not_started'::text, 'sent'::text, 'submitted'::text, 'reviewed'::text, 'completed'::text]))),
  constraint "daily_session_enrolments_prerequisites_status_check" CHECK ((prerequisites_status = ANY (ARRAY['not_reviewed'::text, 'met'::text, 'not_met'::text, 'to_clarify'::text]))),
  constraint "daily_session_enrolments_session_id_learner_id_key" UNIQUE (session_id, learner_id),
  constraint "daily_session_enrolments_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'public_form'::text, 'import'::text, 'legacy'::text]))),
  constraint "daily_session_enrolments_status_check" CHECK ((status = ANY (ARRAY['invited'::text, 'pending'::text, 'confirmed'::text, 'declined'::text, 'cancelled'::text, 'abandoned'::text, 'completed'::text])))
);
create table public.daily_sessions (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "formation_id" uuid not null,
  "modality" text not null,
  "distance_mode" text,
  "blended_elearning_periods" text,
  "blended_in_person_days" text,
  "schedule_blocks" jsonb default '[]'::jsonb not null,
  "location_address" text,
  "remote_url" text,
  "companies" jsonb default '[]'::jsonb not null,
  "beneficiaries" jsonb default '[]'::jsonb not null,
  "individual_beneficiaries" jsonb default '[]'::jsonb not null,
  "status" text default 'ready'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "trainer_ids" jsonb default '[]'::jsonb not null,
  "registration_token" text,
  "registration_status" text default 'to_prepare'::text not null,
  "registration_summary" jsonb default '{}'::jsonb not null,
  "adaptation_needed" boolean default false not null,
  "registration_prepared_at" timestamp with time zone,
  "registration_sent_at" timestamp with time zone,
  "registration_responses_received_at" timestamp with time zone,
  "registration_summary_validated_at" timestamp with time zone,
  "start_date" date,
  "end_date" date,
  "organisation_id" uuid not null,
  "internal_reference" text,
  "max_participants" integer,
  constraint "daily_sessions_distance_mode_check" CHECK ((distance_mode = ANY (ARRAY['synchrone'::text, 'asynchrone'::text]))),
  constraint "daily_sessions_max_participants_check" CHECK (((max_participants IS NULL) OR (max_participants > 0))),
  constraint "daily_sessions_modality_check" CHECK ((modality = ANY (ARRAY['presentiel'::text, 'distanciel'::text, 'mixte'::text]))),
  constraint "daily_sessions_pkey" PRIMARY KEY (id),
  constraint "daily_sessions_registration_status_check" CHECK ((registration_status = ANY (ARRAY['to_prepare'::text, 'to_review'::text, 'ready_to_send'::text, 'sent'::text, 'responses_received'::text, 'summary_to_review'::text, 'summary_validated'::text]))),
  constraint "daily_sessions_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'archived'::text])))
);
CREATE UNIQUE INDEX daily_learners_org_email_unique ON public.daily_learners USING btree (organisation_id, lower(btrim(email))) WHERE (email IS NOT NULL);
CREATE OR REPLACE FUNCTION public.daily_materialize_registration_request(p_request_id uuid, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_request public.daily_formation_registration_requests%rowtype;
  v_session public.daily_sessions%rowtype;
  v_formation_organisation_id uuid;
  v_participants jsonb;
  v_participant jsonb;
  v_index integer := 0;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_job_title text;
  v_learner_id uuid;
  v_enrolment_id uuid;
  v_ids jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  select * into v_request
  from public.daily_formation_registration_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'registration request not found';
  end if;

  if v_request.decision_status <> 'accepted' then
    raise exception 'registration request must be accepted first';
  end if;

  if p_session_id is null and v_request.attached_session_id is null then
    raise exception 'session required';
  end if;

  select * into v_session
  from public.daily_sessions
  where id = coalesce(p_session_id, v_request.attached_session_id)
    and status <> 'archived';

  if not found then
    raise exception 'session not found';
  end if;

  select organisation_id into v_formation_organisation_id
  from public.daily_formations
  where id = v_request.formation_id;

  if v_formation_organisation_id is null
     or v_session.organisation_id <> v_formation_organisation_id
     or v_session.formation_id <> v_request.formation_id then
    raise exception 'session does not match registration request';
  end if;

  if v_request.response_type = 'beneficiary' then
    v_participants := jsonb_build_array(jsonb_build_object(
      'first_name', v_request.respondent_first_name,
      'last_name', v_request.respondent_last_name,
      'email', v_request.respondent_email
    ));
  else
    v_participants := case
      when jsonb_typeof(v_request.participants) = 'array' then v_request.participants
      else '[]'::jsonb
    end;
  end if;

  if jsonb_array_length(v_participants) = 0 then
    raise exception 'no participant to enrol';
  end if;

  for v_participant in select value from jsonb_array_elements(v_participants)
  loop
    v_first_name := btrim(coalesce(v_participant->>'first_name', v_participant->>'firstname', v_participant->>'firstName', ''));
    v_last_name := btrim(coalesce(v_participant->>'last_name', v_participant->>'lastname', v_participant->>'lastName', ''));
    v_email := lower(btrim(coalesce(v_participant->>'email', v_participant->>'mail', '')));
    v_phone := nullif(btrim(coalesce(v_participant->>'phone', v_participant->>'telephone', '')), '');
    v_job_title := nullif(btrim(coalesce(v_participant->>'job_title', v_participant->>'jobTitle', v_participant->>'position', '')), '');

    if v_first_name = '' or v_last_name = '' or v_email = '' then
      raise exception 'participant name and email are required';
    end if;

    select id into v_learner_id
    from public.daily_learners
    where organisation_id = v_session.organisation_id
      and lower(btrim(email)) = v_email
    limit 1;

    if v_learner_id is null then
      begin
        insert into public.daily_learners(
          organisation_id, first_name, last_name, email, phone, company_name, job_title, status, created_by
        ) values (
          v_session.organisation_id,
          v_first_name,
          v_last_name,
          v_email,
          v_phone,
          nullif(btrim(coalesce(v_request.company_name, '')), ''),
          v_job_title,
          'active',
          v_request.user_id
        ) returning id into v_learner_id;
      exception when unique_violation then
        select id into v_learner_id
        from public.daily_learners
        where organisation_id = v_session.organisation_id
          and lower(btrim(email)) = v_email
        limit 1;
      end;
    else
      update public.daily_learners
      set first_name = v_first_name,
          last_name = v_last_name,
          phone = coalesce(v_phone, phone),
          company_name = coalesce(nullif(btrim(coalesce(v_request.company_name, '')), ''), company_name),
          job_title = coalesce(v_job_title, job_title),
          status = 'active',
          updated_at = now()
      where id = v_learner_id;
    end if;

    select id into v_enrolment_id
    from public.daily_session_enrolments
    where session_id = v_session.id and learner_id = v_learner_id
    limit 1;

    if v_enrolment_id is null then
      begin
        insert into public.daily_session_enrolments(
          organisation_id, session_id, learner_id, status, funding_type,
          company_name, company_contact_name, company_contact_email,
          positioning_status, prerequisites_status, source, created_by
        ) values (
          v_session.organisation_id,
          v_session.id,
          v_learner_id,
          'pending',
          'unknown',
          nullif(btrim(coalesce(v_request.company_name, '')), ''),
          nullif(btrim(concat_ws(' ', v_request.respondent_first_name, v_request.respondent_last_name)), ''),
          nullif(lower(btrim(coalesce(v_request.respondent_email, ''))), ''),
          'not_started',
          'not_reviewed',
          'public_form',
          v_request.user_id
        ) returning id into v_enrolment_id;
      exception when unique_violation then
        select id into v_enrolment_id
        from public.daily_session_enrolments
        where session_id = v_session.id and learner_id = v_learner_id
        limit 1;
      end;
    end if;

    insert into public.daily_registration_request_enrolments(
      registration_request_id, participant_index, participant_email, learner_id, enrolment_id
    ) values (
      v_request.id, v_index, v_email, v_learner_id, v_enrolment_id
    )
    on conflict (registration_request_id, participant_index)
    do update set participant_email = excluded.participant_email,
                  learner_id = excluded.learner_id,
                  enrolment_id = excluded.enrolment_id,
                  materialized_at = now();

    v_ids := v_ids || jsonb_build_array(v_enrolment_id);
    v_count := v_count + 1;
    v_index := v_index + 1;
  end loop;

  update public.daily_formation_registration_requests
  set attached_session_id = v_session.id,
      status = 'attached',
      materialized_at = coalesce(materialized_at, now()),
      updated_at = now()
  where id = v_request.id;

  return jsonb_build_object(
    'request_id', v_request.id,
    'session_id', v_session.id,
    'materialized_count', v_count,
    'enrolment_ids', v_ids
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.daily_posttraining_document_session_id(p_document_type text, p_linked_object_type text, p_linked_object_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select case when p_document_type='attendance_summary' and p_linked_object_type='session' then p_linked_object_id when p_document_type='completion_certificate' and p_linked_object_type='enrolment' then (select e.session_id from public.daily_session_enrolments e where e.id=p_linked_object_id) else null end;$function$;

CREATE OR REPLACE FUNCTION public.daily_pretraining_document_session_id(p_document_type text, p_linked_object_type text, p_linked_object_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select case when p_document_type in ('training_program','training_agreement') and p_linked_object_type='session' then p_linked_object_id when p_document_type in ('convocation','registration_positioning') and p_linked_object_type='enrolment' then (select e.session_id from public.daily_session_enrolments e where e.id=p_linked_object_id) else null end;
$function$;

CREATE OR REPLACE FUNCTION public.daily_validate_posttraining_document_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare linked_org uuid;
begin
  if new.document_type not in ('attendance_summary','completion_certificate') then return new; end if;
  if new.document_type = 'attendance_summary' then
    if new.linked_object_type is distinct from 'session' or new.linked_object_id is null then raise exception 'Daily attendance summary must link to a session'; end if;
    select s.organisation_id into linked_org from public.daily_sessions s where s.id = new.linked_object_id;
  else
    if new.linked_object_type is distinct from 'enrolment' or new.linked_object_id is null then raise exception 'Daily completion certificate must link to an enrolment'; end if;
    select e.organisation_id into linked_org from public.daily_session_enrolments e where e.id = new.linked_object_id;
  end if;
  if linked_org is null then raise exception 'Daily post-training linked object not found'; end if;
  if linked_org <> new.organisation_id then raise exception 'Daily post-training document organisation mismatch'; end if;
  return new;
end;$function$;

CREATE OR REPLACE FUNCTION public.daily_validate_pretraining_document_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare linked_org uuid;
begin
  if new.document_type not in ('training_program','training_agreement','convocation','registration_positioning') then return new; end if;
  if new.document_type in ('training_program','training_agreement') then
    if new.linked_object_type is distinct from 'session' or new.linked_object_id is null then raise exception 'Daily session pretraining document must link to a session'; end if;
    select s.organisation_id into linked_org from public.daily_sessions s where s.id=new.linked_object_id;
  else
    if new.linked_object_type is distinct from 'enrolment' or new.linked_object_id is null then raise exception 'Daily learner pretraining document must link to an enrolment'; end if;
    select e.organisation_id into linked_org from public.daily_session_enrolments e where e.id=new.linked_object_id;
  end if;
  if linked_org is null then raise exception 'Daily pretraining linked object not found'; end if;
  if linked_org<>new.organisation_id then raise exception 'Daily pretraining document organisation mismatch'; end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.prevent_signed_daily_document_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.signed_at is not null or old.status = 'signed' then
    if new.signed_at is distinct from old.signed_at or new.signed_at is null then
      raise exception 'signed_at cannot be removed or changed on signed Daily documents';
    end if;

    if new.status is distinct from old.status or new.status <> 'signed' then
      raise exception 'signed Daily documents must keep status signed; archive with archived_at only';
    end if;

    if (
      new.organisation_id is distinct from old.organisation_id
      or new.storage_path is distinct from old.storage_path
      or new.bucket is distinct from old.bucket
      or new.mime_type is distinct from old.mime_type
      or new.sha256 is distinct from old.sha256
      or new.size_bytes is distinct from old.size_bytes
      or new.version is distinct from old.version
      or new.logical_name is distinct from old.logical_name
      or new.document_type is distinct from old.document_type
      or new.linked_object_type is distinct from old.linked_object_type
      or new.linked_object_id is distinct from old.linked_object_id
      or new.created_by is distinct from old.created_by
      or new.updated_by is distinct from old.updated_by
      or new.created_at is distinct from old.created_at
      or new.published_at is distinct from old.published_at
      or new.is_current is distinct from old.is_current
      or new.previous_document_id is distinct from old.previous_document_id
      or new.validated_by is distinct from old.validated_by
      or new.validated_at is distinct from old.validated_at
      or new.metadata is distinct from old.metadata
    ) then
      raise exception 'signed Daily documents are immutable except archived_at; create a new version instead';
    end if;
  elsif old.published_at is not null or old.status = 'published' then
    if new.status not in ('published', 'archived') then
      raise exception 'published Daily documents can only remain published or be archived';
    end if;

    if (
      new.organisation_id is distinct from old.organisation_id
      or new.storage_path is distinct from old.storage_path
      or new.bucket is distinct from old.bucket
      or new.mime_type is distinct from old.mime_type
      or new.sha256 is distinct from old.sha256
      or new.size_bytes is distinct from old.size_bytes
      or new.version is distinct from old.version
      or new.logical_name is distinct from old.logical_name
      or new.document_type is distinct from old.document_type
      or new.linked_object_type is distinct from old.linked_object_type
      or new.linked_object_id is distinct from old.linked_object_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
      or new.published_at is distinct from old.published_at
      or new.previous_document_id is distinct from old.previous_document_id
      or new.validated_by is distinct from old.validated_by
      or new.validated_at is distinct from old.validated_at
      or new.signed_at is distinct from old.signed_at
      or new.metadata is distinct from old.metadata
    ) then
      raise exception 'published Daily documents cannot be overwritten; create a new version instead';
    end if;
  end if;

  return new;
end;
$function$;

create trigger prevent_signed_daily_document_mutation before update on public.daily_documents for each row execute function public.prevent_signed_daily_document_mutation();
create trigger daily_documents_validate_pretraining_scope before insert or update on public.daily_documents for each row execute function public.daily_validate_pretraining_document_scope();
create trigger daily_documents_validate_posttraining_scope before insert or update on public.daily_documents for each row execute function public.daily_validate_posttraining_document_scope();

