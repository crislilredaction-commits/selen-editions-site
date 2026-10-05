-- A4 — private prerequisite evidence from both public candidature links.
-- Upload remains distinct from the immutable human review trail.

alter table public.daily_formation_registration_requests
  add column if not exists prerequisite_submission_fingerprint text;
alter table public.daily_registration_responses
  add column if not exists prerequisite_submission_fingerprint text;

alter table public.daily_formation_registration_requests
  drop constraint if exists daily_formation_registration_requests_prerequisite_fingerprint_check;
alter table public.daily_formation_registration_requests
  add constraint daily_formation_registration_requests_prerequisite_fingerprint_check
  check (prerequisite_submission_fingerprint is null or prerequisite_submission_fingerprint ~ '^[0-9a-f]{64}$');
alter table public.daily_registration_responses
  drop constraint if exists daily_registration_responses_prerequisite_fingerprint_check;
alter table public.daily_registration_responses
  add constraint daily_registration_responses_prerequisite_fingerprint_check
  check (prerequisite_submission_fingerprint is null or prerequisite_submission_fingerprint ~ '^[0-9a-f]{64}$');

alter table public.daily_prerequisite_evidence
  alter column registration_request_id drop not null,
  add column if not exists registration_response_id uuid references public.daily_registration_responses(id) on delete cascade;

alter table public.daily_prerequisite_evidence
  drop constraint if exists daily_prerequisite_evidence_exact_owner;
alter table public.daily_prerequisite_evidence
  add constraint daily_prerequisite_evidence_exact_owner check (
    (registration_request_id is not null and registration_response_id is null)
    or (registration_request_id is null and registration_response_id is not null)
  );

create unique index if not exists daily_prerequisite_evidence_response_requirement_unique
  on public.daily_prerequisite_evidence(registration_response_id, participant_index, requirement_id)
  where registration_response_id is not null;
create index if not exists daily_prerequisite_evidence_response_idx
  on public.daily_prerequisite_evidence(registration_response_id, participant_index, status)
  where registration_response_id is not null;

create table if not exists public.daily_prerequisite_evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.daily_prerequisite_evidence(id) on delete restrict,
  document_id uuid not null references public.daily_documents(id) on delete restrict,
  decision text not null check (decision in ('verified','rejected')),
  review_comment text,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now()
);

comment on table public.daily_prerequisite_evidence_reviews is
  'Immutable human review trail for every prerequisite evidence version.';
create index if not exists daily_prerequisite_evidence_reviews_evidence_idx
  on public.daily_prerequisite_evidence_reviews(evidence_id, reviewed_at desc);
alter table public.daily_prerequisite_evidence_reviews enable row level security;
revoke all on table public.daily_prerequisite_evidence_reviews from public, anon, authenticated;
revoke update, delete, truncate on table public.daily_prerequisite_evidence_reviews from service_role;
grant select, insert on table public.daily_prerequisite_evidence_reviews to service_role;

create or replace function public.seed_daily_prerequisite_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  formation_row record;
  target_formation_id uuid;
  target_organisation_id uuid;
  target_session_id uuid;
  target_request_id uuid;
  target_response_id uuid;
  target_response_type text;
  target_participants jsonb;
  target_respondent_first_name text;
  target_respondent_last_name text;
  target_respondent_email text;
  target_subject jsonb;
  target_fingerprint text;
  target_link_type text;
  requirement jsonb;
  target_requirement_id text;
  target_requirement_label text;
  participant_count integer;
  target_participant_index integer;
  expected_count integer := 0;
  matching_count integer;
  matching_document_id uuid;
begin
  if tg_table_name = 'daily_formation_registration_requests' then
    target_request_id := new.id;
    target_response_id := null;
    target_formation_id := new.formation_id;
    target_session_id := new.attached_session_id;
    target_response_type := new.response_type;
    target_participants := new.participants;
    target_respondent_first_name := new.respondent_first_name;
    target_respondent_last_name := new.respondent_last_name;
    target_respondent_email := new.respondent_email;
    target_fingerprint := new.prerequisite_submission_fingerprint;
    target_link_type := 'registration_request';
    select f.organisation_id into target_organisation_id
      from public.daily_formations f where f.id = target_formation_id;
  elsif tg_table_name = 'daily_registration_responses' then
    target_request_id := null;
    target_response_id := new.id;
    target_session_id := new.session_id;
    target_response_type := new.response_type;
    target_participants := new.participants;
    target_respondent_first_name := new.respondent_first_name;
    target_respondent_last_name := new.respondent_last_name;
    target_respondent_email := new.respondent_email;
    target_fingerprint := new.prerequisite_submission_fingerprint;
    target_link_type := 'registration_response';
    select s.formation_id, s.organisation_id
      into target_formation_id, target_organisation_id
      from public.daily_sessions s where s.id = target_session_id;
  else
    raise exception using errcode = 'PSE01', message = 'Propriétaire de justificatif non pris en charge.';
  end if;

  select f.prerequisite_mode, f.prerequisite_requirements
    into formation_row
    from public.daily_formations f
   where f.id = target_formation_id and f.organisation_id = target_organisation_id;
  if not found then
    raise exception using errcode = 'PSE01', message = 'Formation de la candidature introuvable.';
  end if;
  if formation_row.prerequisite_mode is distinct from 'required' then
    return new;
  end if;
  if target_fingerprint is null or target_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '23514', message = 'Tous les justificatifs de prérequis obligatoires doivent être joints à la candidature.';
  end if;

  participant_count := case
    when target_response_type = 'company' then greatest(jsonb_array_length(coalesce(target_participants, '[]'::jsonb)), 1)
    else 1
  end;

  for target_participant_index in 0..participant_count - 1 loop
    target_subject := case when target_response_type = 'company'
      then coalesce(target_participants->target_participant_index, '{}'::jsonb)
      else jsonb_build_object(
        'first_name', target_respondent_first_name,
        'last_name', target_respondent_last_name,
        'email', target_respondent_email
      ) end;
    for requirement in
      select value from jsonb_array_elements(coalesce(formation_row.prerequisite_requirements, '[]'::jsonb))
    loop
      target_requirement_id := btrim(requirement->>'id');
      target_requirement_label := btrim(requirement->>'label');
      if coalesce(target_requirement_id, '') = '' or coalesce(target_requirement_label, '') = '' then
        raise exception using errcode = '23514', message = 'Configuration des prérequis obligatoires incohérente.';
      end if;
      expected_count := expected_count + 1;
      insert into public.daily_prerequisite_evidence (
        registration_request_id, registration_response_id, participant_index,
        requirement_id, requirement_label, status
      ) values (
        target_request_id, target_response_id, target_participant_index,
        target_requirement_id, target_requirement_label, 'awaiting_upload'
      ) on conflict do nothing;

      select count(*)::integer, min(d.id::text)::uuid
        into matching_count, matching_document_id
        from public.daily_documents d
       where d.organisation_id = target_organisation_id
         and d.formation_id = target_formation_id
         and d.session_id is not distinct from target_session_id
         and d.document_type = 'prerequisite_application_evidence'
         and d.linked_object_type = target_link_type
         and d.linked_object_id = new.id
         and d.bucket = 'documents'
         and d.storage_path like 'daily/' || target_organisation_id::text || '/prerequisite-applications/' || target_formation_id::text || '/' || new.id::text || '/%'
         and d.is_current
         and d.status <> 'archived'
         and d.sha256 ~ '^[0-9a-f]{64}$'
         and d.metadata->>'source' = 'daily_prerequisite_evidence'
         and d.metadata->>'submission_fingerprint' = target_fingerprint
         and coalesce(d.metadata->>'staged_replacement', 'false') = 'false'
         and d.metadata->>'participant_index' = target_participant_index::text
         and d.metadata->>'requirement_id' = target_requirement_id
         and btrim(d.metadata->>'subject_first_name') = btrim(target_subject->>'first_name')
         and btrim(d.metadata->>'subject_last_name') = btrim(target_subject->>'last_name')
         and lower(btrim(d.metadata->>'subject_email')) = lower(btrim(target_subject->>'email'));
      if matching_count <> 1 then
        raise exception using errcode = '23514', message = 'Chaque prérequis obligatoire doit avoir exactement un justificatif privé valide.';
      end if;

      update public.daily_prerequisite_evidence e
         set document_id = matching_document_id,
             status = 'submitted',
             submitted_at = now(),
             updated_at = now()
       where e.registration_request_id is not distinct from target_request_id
         and e.registration_response_id is not distinct from target_response_id
         and e.participant_index = target_participant_index
         and e.requirement_id = target_requirement_id
         and e.status = 'awaiting_upload';
    end loop;
  end loop;

  if expected_count = 0 then
    raise exception using errcode = '23514', message = 'Au moins un justificatif doit être défini pour des prérequis obligatoires.';
  end if;
  select count(*)::integer into matching_count
    from public.daily_documents d
   where d.organisation_id = target_organisation_id
     and d.formation_id = target_formation_id
     and d.session_id is not distinct from target_session_id
     and d.document_type = 'prerequisite_application_evidence'
     and d.linked_object_type = target_link_type
     and d.linked_object_id = new.id
     and d.is_current
     and d.status <> 'archived'
     and d.metadata->>'source' = 'daily_prerequisite_evidence'
     and d.metadata->>'submission_fingerprint' = target_fingerprint
     and coalesce(d.metadata->>'staged_replacement', 'false') = 'false';
  if matching_count <> expected_count then
    raise exception using errcode = '23514', message = 'Le jeu de justificatifs ne correspond pas exactement aux prérequis de la candidature.';
  end if;
  return new;
end;
$$;

revoke all on function public.seed_daily_prerequisite_evidence() from public, anon, authenticated;
grant execute on function public.seed_daily_prerequisite_evidence() to service_role;

drop trigger if exists daily_registration_seed_prerequisite_evidence on public.daily_formation_registration_requests;
create trigger daily_registration_seed_prerequisite_evidence
after insert on public.daily_formation_registration_requests
for each row execute function public.seed_daily_prerequisite_evidence();

drop trigger if exists daily_registration_response_seed_prerequisite_evidence on public.daily_registration_responses;
create trigger daily_registration_response_seed_prerequisite_evidence
after insert on public.daily_registration_responses
for each row execute function public.seed_daily_prerequisite_evidence();

create or replace function public.review_daily_prerequisite_evidence(
  p_evidence_id uuid,
  p_expected_updated_at timestamptz,
  p_decision text,
  p_comment text,
  p_reviewer uuid
)
returns public.daily_prerequisite_evidence
language plpgsql
set search_path = ''
as $$
declare
  current_row public.daily_prerequisite_evidence%rowtype;
  result_row public.daily_prerequisite_evidence%rowtype;
begin
  if p_decision not in ('verified','rejected') then
    raise exception using errcode = '22023', message = 'Décision de revue invalide.';
  end if;
  if p_decision = 'rejected' and coalesce(btrim(p_comment), '') = '' then
    raise exception using errcode = '23514', message = 'Le motif du refus est obligatoire.';
  end if;
  select * into current_row from public.daily_prerequisite_evidence
   where id = p_evidence_id for update;
  if not found or current_row.status <> 'submitted' or current_row.document_id is null then
    raise exception using errcode = 'PSE01', message = 'Ce justificatif n’est plus en attente de revue.';
  end if;
  if current_row.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'Le justificatif a changé. Rechargez le dossier avant de statuer.';
  end if;

  insert into public.daily_prerequisite_evidence_reviews (
    evidence_id, document_id, decision, review_comment, reviewed_by, reviewed_at
  ) values (
    current_row.id, current_row.document_id, p_decision, nullif(btrim(p_comment), ''), p_reviewer, now()
  );

  update public.daily_prerequisite_evidence
     set status = p_decision,
         reviewed_by = p_reviewer,
         reviewed_at = now(),
         review_comment = nullif(btrim(p_comment), ''),
         updated_at = now()
   where id = current_row.id
   returning * into result_row;
  return result_row;
end;
$$;

revoke all on function public.review_daily_prerequisite_evidence(uuid,timestamptz,text,text,uuid) from public, anon, authenticated;
grant execute on function public.review_daily_prerequisite_evidence(uuid,timestamptz,text,text,uuid) to service_role;

create or replace function public.replace_daily_prerequisite_evidence_submission(
  p_owner_kind text,
  p_owner_id uuid,
  p_expected_fingerprint text,
  p_new_fingerprint text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  formation_row record;
  target_formation_id uuid;
  target_organisation_id uuid;
  target_session_id uuid;
  target_response_type text;
  target_participants jsonb;
  target_respondent_first_name text;
  target_respondent_last_name text;
  target_respondent_email text;
  target_subject jsonb;
  target_current_fingerprint text;
  target_status text;
  target_decision_status text;
  target_owner_column text;
  target_link_type text;
  target_participant_index integer;
  participant_count integer;
  requirement jsonb;
  target_requirement_id text;
  target_requirement_label text;
  target_evidence_id uuid;
  old_document_id uuid;
  old_document_version integer;
  new_document_id uuid;
  matching_count integer;
  expected_count integer := 0;
begin
  if p_owner_kind not in ('registration_request','registration_response') then
    raise exception using errcode = '22023', message = 'Type de candidature invalide.';
  end if;
  if p_expected_fingerprint !~ '^[0-9a-f]{64}$' or p_new_fingerprint !~ '^[0-9a-f]{64}$' or p_expected_fingerprint = p_new_fingerprint then
    raise exception using errcode = '22023', message = 'Version de justificatifs invalide.';
  end if;

  if p_owner_kind = 'registration_request' then
    select r.formation_id, r.attached_session_id, f.organisation_id,
           r.response_type, r.participants, r.respondent_first_name,
           r.respondent_last_name, r.respondent_email,
           r.prerequisite_submission_fingerprint, r.status, r.decision_status
      into target_formation_id, target_session_id, target_organisation_id,
           target_response_type, target_participants, target_respondent_first_name,
           target_respondent_last_name, target_respondent_email,
           target_current_fingerprint, target_status, target_decision_status
      from public.daily_formation_registration_requests r
      join public.daily_formations f on f.id = r.formation_id
     where r.id = p_owner_id
     for update of r;
    target_owner_column := 'request';
    target_link_type := 'registration_request';
    if not found or target_decision_status <> 'pending' or target_status in ('refused','cancelled','archived') then
      raise exception using errcode = 'PSE01', message = 'Ce dossier ne peut plus recevoir de justificatif.';
    end if;
  else
    select s.formation_id, r.session_id, s.organisation_id,
           r.response_type, r.participants, r.respondent_first_name,
           r.respondent_last_name, r.respondent_email,
           r.prerequisite_submission_fingerprint, r.status
      into target_formation_id, target_session_id, target_organisation_id,
           target_response_type, target_participants, target_respondent_first_name,
           target_respondent_last_name, target_respondent_email,
           target_current_fingerprint, target_status
      from public.daily_registration_responses r
      join public.daily_sessions s on s.id = r.session_id
     where r.id = p_owner_id
     for update of r;
    target_owner_column := 'response';
    target_link_type := 'registration_response';
    if not found or target_status <> 'submitted' then
      raise exception using errcode = 'PSE01', message = 'Ce dossier ne peut plus recevoir de justificatif.';
    end if;
  end if;

  if target_current_fingerprint is distinct from p_expected_fingerprint then
    raise exception using errcode = '40001', message = 'Les justificatifs ont déjà changé. Rechargez le dossier.';
  end if;
  if not exists (
    select 1 from public.daily_prerequisite_evidence e
     where ((target_owner_column = 'request' and e.registration_request_id = p_owner_id)
         or (target_owner_column = 'response' and e.registration_response_id = p_owner_id))
       and e.status = 'rejected'
  ) or exists (
    select 1 from public.daily_prerequisite_evidence e
     where ((target_owner_column = 'request' and e.registration_request_id = p_owner_id)
         or (target_owner_column = 'response' and e.registration_response_id = p_owner_id))
       and e.status not in ('verified','rejected')
  ) then
    raise exception using errcode = 'PSE01', message = 'Seul un jeu de justificatifs relu et refusé peut être remplacé.';
  end if;

  select f.prerequisite_mode, f.prerequisite_requirements
    into formation_row from public.daily_formations f
   where f.id = target_formation_id and f.organisation_id = target_organisation_id;
  if not found or formation_row.prerequisite_mode is distinct from 'required' then
    raise exception using errcode = 'PSE01', message = 'Les prérequis obligatoires de la formation sont indisponibles.';
  end if;
  participant_count := case
    when target_response_type = 'company' then greatest(jsonb_array_length(coalesce(target_participants, '[]'::jsonb)), 1)
    else 1
  end;

  for target_participant_index in 0..participant_count - 1 loop
    target_subject := case when target_response_type = 'company'
      then coalesce(target_participants->target_participant_index, '{}'::jsonb)
      else jsonb_build_object(
        'first_name', target_respondent_first_name,
        'last_name', target_respondent_last_name,
        'email', target_respondent_email
      ) end;
    for requirement in
      select value from jsonb_array_elements(coalesce(formation_row.prerequisite_requirements, '[]'::jsonb))
    loop
      target_requirement_id := btrim(requirement->>'id');
      target_requirement_label := btrim(requirement->>'label');
      if coalesce(target_requirement_id, '') = '' or coalesce(target_requirement_label, '') = '' then
        raise exception using errcode = '23514', message = 'Configuration des prérequis obligatoires incohérente.';
      end if;
      expected_count := expected_count + 1;

      select e.id, e.document_id, d.version
        into target_evidence_id, old_document_id, old_document_version
        from public.daily_prerequisite_evidence e
        join public.daily_documents d on d.id = e.document_id
       where ((target_owner_column = 'request' and e.registration_request_id = p_owner_id and e.registration_response_id is null)
           or (target_owner_column = 'response' and e.registration_response_id = p_owner_id and e.registration_request_id is null))
         and e.participant_index = target_participant_index
         and e.requirement_id = target_requirement_id
         and e.requirement_label = target_requirement_label
         and e.status in ('verified','rejected')
         and d.is_current and d.status <> 'archived'
       for update of e, d;
      if not found then
        raise exception using errcode = 'PSE01', message = 'Le justificatif remplacé ne correspond plus au dossier relu.';
      end if;

      select count(*)::integer, min(d.id::text)::uuid
        into matching_count, new_document_id
        from public.daily_documents d
       where d.organisation_id = target_organisation_id
         and d.formation_id = target_formation_id
         and d.session_id is not distinct from target_session_id
         and d.document_type = 'prerequisite_application_evidence'
         and d.linked_object_type = target_link_type
         and d.linked_object_id = p_owner_id
         and d.bucket = 'documents'
         and d.storage_path like 'daily/' || target_organisation_id::text || '/prerequisite-applications/' || target_formation_id::text || '/' || p_owner_id::text || '/%'
         and not d.is_current
         and d.status <> 'archived'
         and d.sha256 ~ '^[0-9a-f]{64}$'
         and d.metadata->>'source' = 'daily_prerequisite_evidence'
         and d.metadata->>'submission_fingerprint' = p_new_fingerprint
         and d.metadata->>'staged_replacement' = 'true'
         and d.metadata->>'participant_index' = target_participant_index::text
         and d.metadata->>'requirement_id' = target_requirement_id
         and btrim(d.metadata->>'subject_first_name') = btrim(target_subject->>'first_name')
         and btrim(d.metadata->>'subject_last_name') = btrim(target_subject->>'last_name')
         and lower(btrim(d.metadata->>'subject_email')) = lower(btrim(target_subject->>'email'));
      if matching_count <> 1 then
        raise exception using errcode = '23514', message = 'Chaque prérequis obligatoire doit avoir exactement un justificatif corrigé.';
      end if;

      update public.daily_documents
         set is_current = false
       where id = old_document_id and is_current;
      if not found then
        raise exception using errcode = '40001', message = 'Le justificatif relu a déjà changé. Rechargez le dossier.';
      end if;
      update public.daily_documents
         set is_current = true,
             version = coalesce(old_document_version, 1) + 1,
             previous_document_id = old_document_id
       where id = new_document_id and not is_current;
      if not found then
        raise exception using errcode = '40001', message = 'Le justificatif corrigé a déjà été utilisé. Rechargez le dossier.';
      end if;
      update public.daily_prerequisite_evidence
         set document_id = new_document_id,
             status = 'submitted',
             submitted_at = now(),
             reviewed_by = null,
             reviewed_at = null,
             review_comment = null,
             updated_at = now()
       where id = target_evidence_id;
    end loop;
  end loop;

  if expected_count = 0 then
    raise exception using errcode = '23514', message = 'Au moins un justificatif corrigé doit être défini.';
  end if;
  select count(*)::integer into matching_count
    from public.daily_documents d
   where d.organisation_id = target_organisation_id
     and d.formation_id = target_formation_id
     and d.session_id is not distinct from target_session_id
     and d.document_type = 'prerequisite_application_evidence'
     and d.linked_object_type = target_link_type
     and d.linked_object_id = p_owner_id
     and d.status <> 'archived'
     and d.metadata->>'source' = 'daily_prerequisite_evidence'
     and d.metadata->>'submission_fingerprint' = p_new_fingerprint
     and d.metadata->>'staged_replacement' = 'true';
  if matching_count <> expected_count then
    raise exception using errcode = '23514', message = 'Le jeu corrigé ne correspond pas exactement aux prérequis de la candidature.';
  end if;

  if target_owner_column = 'request' then
    update public.daily_formation_registration_requests
       set prerequisite_submission_fingerprint = p_new_fingerprint
     where id = p_owner_id and prerequisite_submission_fingerprint = p_expected_fingerprint;
  else
    update public.daily_registration_responses
       set prerequisite_submission_fingerprint = p_new_fingerprint
     where id = p_owner_id and prerequisite_submission_fingerprint = p_expected_fingerprint;
  end if;
  if not found then
    raise exception using errcode = '40001', message = 'La candidature a déjà changé. Rechargez le dossier.';
  end if;
end;
$$;

revoke all on function public.replace_daily_prerequisite_evidence_submission(text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.replace_daily_prerequisite_evidence_submission(text,uuid,text,text) to service_role;

create or replace function public.guard_daily_registration_prerequisite_acceptance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  formation_row record;
  participant_count integer;
  required_participant_index integer;
  requirement jsonb;
begin
  if new.decision_status <> 'accepted' or old.decision_status = 'accepted' then return new; end if;
  select prerequisite_mode, prerequisite_requirements into formation_row
    from public.daily_formations where id = new.formation_id;
  if formation_row.prerequisite_mode is distinct from 'required' then return new; end if;
  participant_count := case when new.response_type = 'company' then greatest(jsonb_array_length(coalesce(new.participants, '[]'::jsonb)), 1) else 1 end;
  if jsonb_array_length(coalesce(formation_row.prerequisite_requirements, '[]'::jsonb)) = 0 then
    raise exception using errcode = '23514', message = 'Impossible d’accepter la candidature : aucun justificatif obligatoire n’est configuré.';
  end if;
  for required_participant_index in 0..participant_count - 1 loop
    for requirement in select value from jsonb_array_elements(coalesce(formation_row.prerequisite_requirements, '[]'::jsonb)) loop
      if not exists (
        select 1 from public.daily_prerequisite_evidence e
         where e.registration_request_id = new.id
           and e.registration_response_id is null
           and e.participant_index = required_participant_index
           and e.requirement_id = btrim(requirement->>'id')
           and e.requirement_label = btrim(requirement->>'label')
           and e.document_id is not null
           and e.status = 'verified'
      ) then
        raise exception using errcode = '23514', message = 'Impossible d’accepter la candidature : tous les justificatifs de prérequis obligatoires doivent être vérifiés humainement.';
      end if;
    end loop;
  end loop;
  return new;
end;
$$;

revoke all on function public.guard_daily_registration_prerequisite_acceptance() from public, anon, authenticated;
grant execute on function public.guard_daily_registration_prerequisite_acceptance() to service_role;
