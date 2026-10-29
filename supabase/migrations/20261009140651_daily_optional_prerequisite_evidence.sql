-- Optional prerequisite evidence: only mandatory requests block submission and
-- admission. Missing optional files create no evidence row. During correction,
-- only rejected evidence is replaced; previously verified documents remain current.

create or replace function public.seed_daily_prerequisite_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
#variable_conflict use_variable
declare
  f record;
  formation_id uuid;
  organisation_id uuid;
  session_id uuid;
  request_id uuid;
  response_id uuid;
  response_type text;
  participants jsonb;
  respondent_first_name text;
  respondent_last_name text;
  respondent_email text;
  subject jsonb;
  fingerprint text;
  link_type text;
  requirement jsonb;
  requirement_id text;
  requirement_label text;
  requirement_required boolean;
  participant_count integer;
  participant_index integer;
  configured_count integer := 0;
  selected_count integer := 0;
  matching_count integer;
  matching_document_id uuid;
begin
  if tg_table_name = 'daily_formation_registration_requests' then
    request_id := new.id; response_id := null; formation_id := new.formation_id;
    session_id := new.attached_session_id; response_type := new.response_type;
    participants := new.participants; respondent_first_name := new.respondent_first_name;
    respondent_last_name := new.respondent_last_name; respondent_email := new.respondent_email;
    fingerprint := new.prerequisite_submission_fingerprint; link_type := 'registration_request';
    select x.organisation_id into organisation_id from public.daily_formations x where x.id = formation_id;
  elsif tg_table_name = 'daily_registration_responses' then
    request_id := null; response_id := new.id; session_id := new.session_id;
    response_type := new.response_type; participants := new.participants;
    respondent_first_name := new.respondent_first_name; respondent_last_name := new.respondent_last_name;
    respondent_email := new.respondent_email; fingerprint := new.prerequisite_submission_fingerprint;
    link_type := 'registration_response';
    select x.formation_id, x.organisation_id into formation_id, organisation_id
      from public.daily_sessions x where x.id = session_id;
  else
    raise exception using errcode = 'PSE01', message = 'Propriétaire de justificatif non pris en charge.';
  end if;

  select x.prerequisite_mode, x.prerequisite_requirements into f
    from public.daily_formations x where x.id = formation_id and x.organisation_id = organisation_id;
  if not found then raise exception using errcode = 'PSE01', message = 'Formation de la candidature introuvable.'; end if;
  if f.prerequisite_mode is distinct from 'required' then return new; end if;
  if fingerprint is null or fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '23514', message = 'La version des justificatifs de prérequis est absente.';
  end if;
  if jsonb_array_length(coalesce(f.prerequisite_requirements, '[]'::jsonb)) = 0 then
    raise exception using errcode = '23514', message = 'Au moins un justificatif doit être configuré.';
  end if;

  participant_count := case when response_type = 'company'
    then greatest(jsonb_array_length(coalesce(participants, '[]'::jsonb)), 1) else 1 end;
  for participant_index in 0..participant_count - 1 loop
    subject := case when response_type = 'company' then coalesce(participants->participant_index, '{}'::jsonb)
      else jsonb_build_object('first_name', respondent_first_name, 'last_name', respondent_last_name, 'email', respondent_email) end;
    for requirement in select value from jsonb_array_elements(coalesce(f.prerequisite_requirements, '[]'::jsonb)) loop
      configured_count := configured_count + 1;
      requirement_id := btrim(requirement->>'id');
      requirement_label := btrim(requirement->>'label');
      requirement_required := coalesce((requirement->>'required')::boolean, true);
      if coalesce(requirement_id, '') = '' or coalesce(requirement_label, '') = '' then
        raise exception using errcode = '23514', message = 'Configuration des justificatifs incohérente.';
      end if;
      select count(*)::integer, min(d.id::text)::uuid into matching_count, matching_document_id
        from public.daily_documents d
       where d.organisation_id = organisation_id and d.formation_id = formation_id
         and d.session_id is not distinct from session_id
         and d.document_type = 'prerequisite_application_evidence'
         and d.linked_object_type = link_type and d.linked_object_id = new.id
         and d.bucket = 'documents'
         and d.storage_path like 'daily/' || organisation_id::text || '/prerequisite-applications/' || formation_id::text || '/' || new.id::text || '/%'
         and d.is_current and d.status <> 'archived' and d.sha256 ~ '^[0-9a-f]{64}$'
         and d.metadata->>'source' = 'daily_prerequisite_evidence'
         and d.metadata->>'submission_fingerprint' = fingerprint
         and coalesce(d.metadata->>'staged_replacement', 'false') = 'false'
         and d.metadata->>'participant_index' = participant_index::text
         and d.metadata->>'requirement_id' = requirement_id
         and btrim(d.metadata->>'subject_first_name') = btrim(subject->>'first_name')
         and btrim(d.metadata->>'subject_last_name') = btrim(subject->>'last_name')
         and lower(btrim(d.metadata->>'subject_email')) = lower(btrim(subject->>'email'));
      if matching_count > 1 or (requirement_required and matching_count <> 1) then
        raise exception using errcode = '23514', message = 'Chaque justificatif obligatoire doit avoir exactement un fichier privé valide.';
      end if;
      if matching_count = 1 then
        selected_count := selected_count + 1;
        insert into public.daily_prerequisite_evidence (
          registration_request_id, registration_response_id, participant_index,
          requirement_id, requirement_label, document_id, status, submitted_at
        ) values (
          request_id, response_id, participant_index, requirement_id,
          requirement_label, matching_document_id, 'submitted', now()
        ) on conflict do nothing;
      end if;
    end loop;
  end loop;
  if configured_count = 0 then raise exception using errcode = '23514', message = 'Au moins un justificatif doit être configuré.'; end if;
  select count(*)::integer into matching_count from public.daily_documents d
   where d.organisation_id = organisation_id and d.formation_id = formation_id
     and d.session_id is not distinct from session_id
     and d.document_type = 'prerequisite_application_evidence'
     and d.linked_object_type = link_type and d.linked_object_id = new.id
     and d.is_current and d.status <> 'archived'
     and d.metadata->>'source' = 'daily_prerequisite_evidence'
     and d.metadata->>'submission_fingerprint' = fingerprint
     and coalesce(d.metadata->>'staged_replacement', 'false') = 'false';
  if matching_count <> selected_count then
    raise exception using errcode = '23514', message = 'Le jeu de justificatifs contient une pièce inattendue.';
  end if;
  return new;
end;
$$;

revoke all on function public.seed_daily_prerequisite_evidence() from public, anon, authenticated;
grant execute on function public.seed_daily_prerequisite_evidence() to service_role;

create or replace function public.replace_daily_prerequisite_evidence_submission(
  p_owner_kind text, p_owner_id uuid, p_expected_fingerprint text, p_new_fingerprint text
)
returns void
language plpgsql
set search_path = ''
as $$
#variable_conflict use_variable
declare
  formation_id uuid; organisation_id uuid; session_id uuid; owner_column text; link_type text;
  current_fingerprint text; owner_status text; owner_decision text;
  evidence record; old_document record; new_document_id uuid;
  matching_count integer; replaced_count integer := 0;
begin
  if p_owner_kind not in ('registration_request','registration_response') then
    raise exception using errcode = '22023', message = 'Type de candidature invalide.';
  end if;
  if p_expected_fingerprint !~ '^[0-9a-f]{64}$' or p_new_fingerprint !~ '^[0-9a-f]{64}$' or p_expected_fingerprint = p_new_fingerprint then
    raise exception using errcode = '22023', message = 'Version de justificatifs invalide.';
  end if;
  if p_owner_kind = 'registration_request' then
    select r.formation_id, r.attached_session_id, f.organisation_id,
           r.prerequisite_submission_fingerprint, r.status, r.decision_status
      into formation_id, session_id, organisation_id, current_fingerprint, owner_status, owner_decision
      from public.daily_formation_registration_requests r join public.daily_formations f on f.id = r.formation_id
     where r.id = p_owner_id for update of r;
    owner_column := 'request'; link_type := 'registration_request';
    if not found or owner_decision <> 'pending' or owner_status in ('refused','cancelled','archived') then
      raise exception using errcode = 'PSE01', message = 'Ce dossier ne peut plus recevoir de justificatif.';
    end if;
  else
    select s.formation_id, r.session_id, s.organisation_id,
           r.prerequisite_submission_fingerprint, r.status
      into formation_id, session_id, organisation_id, current_fingerprint, owner_status
      from public.daily_registration_responses r join public.daily_sessions s on s.id = r.session_id
     where r.id = p_owner_id for update of r;
    owner_column := 'response'; link_type := 'registration_response';
    if not found or owner_status <> 'submitted' then
      raise exception using errcode = 'PSE01', message = 'Ce dossier ne peut plus recevoir de justificatif.';
    end if;
  end if;
  if current_fingerprint is distinct from p_expected_fingerprint then
    raise exception using errcode = '40001', message = 'Les justificatifs ont déjà changé. Rechargez le dossier.';
  end if;
  if not exists (
    select 1 from public.daily_prerequisite_evidence e
     where ((owner_column = 'request' and e.registration_request_id = p_owner_id)
         or (owner_column = 'response' and e.registration_response_id = p_owner_id)) and e.status = 'rejected'
  ) or exists (
    select 1 from public.daily_prerequisite_evidence e
     where ((owner_column = 'request' and e.registration_request_id = p_owner_id)
         or (owner_column = 'response' and e.registration_response_id = p_owner_id))
       and e.status not in ('verified','rejected')
  ) then raise exception using errcode = 'PSE01', message = 'Seules les pièces refusées d’un dossier relu peuvent être remplacées.'; end if;

  for evidence in
    select e.* from public.daily_prerequisite_evidence e
     where ((owner_column = 'request' and e.registration_request_id = p_owner_id)
         or (owner_column = 'response' and e.registration_response_id = p_owner_id))
       and e.status = 'rejected' for update
  loop
    select d.* into old_document from public.daily_documents d
     where d.id = evidence.document_id and d.is_current and d.status <> 'archived' for update;
    if not found then raise exception using errcode = '40001', message = 'Le justificatif relu a déjà changé.'; end if;
    select count(*)::integer, min(d.id::text)::uuid into matching_count, new_document_id
      from public.daily_documents d
     where d.organisation_id = organisation_id and d.formation_id = formation_id
       and d.session_id is not distinct from session_id
       and d.document_type = 'prerequisite_application_evidence'
       and d.linked_object_type = link_type and d.linked_object_id = p_owner_id
       and d.bucket = 'documents' and not d.is_current and d.status <> 'archived'
       and d.sha256 ~ '^[0-9a-f]{64}$'
       and d.metadata->>'source' = 'daily_prerequisite_evidence'
       and d.metadata->>'submission_fingerprint' = p_new_fingerprint
       and d.metadata->>'staged_replacement' = 'true'
       and d.metadata->>'participant_index' = evidence.participant_index::text
       and d.metadata->>'requirement_id' = evidence.requirement_id
       and lower(btrim(d.metadata->>'subject_email')) = lower(btrim(old_document.metadata->>'subject_email'));
    if matching_count <> 1 then
      raise exception using errcode = '23514', message = 'Chaque pièce refusée doit avoir exactement un justificatif corrigé.';
    end if;
    update public.daily_documents set is_current = false where id = old_document.id and is_current;
    update public.daily_documents set is_current = true, version = coalesce(old_document.version, 1) + 1,
      previous_document_id = old_document.id where id = new_document_id and not is_current;
    if not found then raise exception using errcode = '40001', message = 'Le justificatif corrigé a déjà été utilisé.'; end if;
    update public.daily_prerequisite_evidence set document_id = new_document_id, status = 'submitted',
      submitted_at = now(), reviewed_by = null, reviewed_at = null, review_comment = null, updated_at = now()
      where id = evidence.id;
    replaced_count := replaced_count + 1;
  end loop;
  select count(*)::integer into matching_count from public.daily_documents d
   where d.organisation_id = organisation_id and d.formation_id = formation_id
     and d.session_id is not distinct from session_id
     and d.document_type = 'prerequisite_application_evidence'
     and d.linked_object_type = link_type and d.linked_object_id = p_owner_id
     and d.status <> 'archived' and d.metadata->>'source' = 'daily_prerequisite_evidence'
     and d.metadata->>'submission_fingerprint' = p_new_fingerprint
     and d.metadata->>'staged_replacement' = 'true';
  if matching_count <> replaced_count then
    raise exception using errcode = '23514', message = 'Le jeu corrigé contient une pièce inattendue.';
  end if;
  if owner_column = 'request' then
    update public.daily_formation_registration_requests set prerequisite_submission_fingerprint = p_new_fingerprint
     where id = p_owner_id and prerequisite_submission_fingerprint = p_expected_fingerprint;
  else
    update public.daily_registration_responses set prerequisite_submission_fingerprint = p_new_fingerprint
     where id = p_owner_id and prerequisite_submission_fingerprint = p_expected_fingerprint;
  end if;
  if not found then raise exception using errcode = '40001', message = 'La candidature a déjà changé.'; end if;
end;
$$;

revoke all on function public.replace_daily_prerequisite_evidence_submission(text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.replace_daily_prerequisite_evidence_submission(text,uuid,text,text) to service_role;

create or replace function public.guard_daily_registration_prerequisite_acceptance()
returns trigger
language plpgsql
set search_path = ''
as $$
#variable_conflict use_variable
declare
  f record; participant_count integer; participant_index integer; requirement jsonb;
begin
  if new.decision_status <> 'accepted' or old.decision_status = 'accepted' then return new; end if;
  select prerequisite_mode, prerequisite_requirements into f from public.daily_formations where id = new.formation_id;
  if f.prerequisite_mode is distinct from 'required' then return new; end if;
  participant_count := case when new.response_type = 'company'
    then greatest(jsonb_array_length(coalesce(new.participants, '[]'::jsonb)), 1) else 1 end;
  for participant_index in 0..participant_count - 1 loop
    for requirement in
      select value from jsonb_array_elements(coalesce(f.prerequisite_requirements, '[]'::jsonb))
       where coalesce((value->>'required')::boolean, true)
    loop
      if not exists (
        select 1 from public.daily_prerequisite_evidence e
         where e.registration_request_id = new.id and e.registration_response_id is null
           and e.participant_index = participant_index
           and e.requirement_id = btrim(requirement->>'id')
           and e.requirement_label = btrim(requirement->>'label')
           and e.document_id is not null and e.status = 'verified'
      ) then
        raise exception using errcode = '23514', message = 'Impossible d’accepter la candidature : les justificatifs obligatoires doivent être vérifiés humainement.';
      end if;
    end loop;
  end loop;
  return new;
end;
$$;

revoke all on function public.guard_daily_registration_prerequisite_acceptance() from public, anon, authenticated;
grant execute on function public.guard_daily_registration_prerequisite_acceptance() to service_role;
