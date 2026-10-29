-- Private OF positioning: attach an already received file to its exact
-- enrolment. No backfill, deletion, public grant, or RLS policy change.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create or replace function public.daily_attach_own_positioning_candidate(p_kind text, p_request_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  r record; original record; proof jsonb; subject jsonb; doc record; enrol record;
  v_participant_index integer; subjects jsonb;
begin
  if p_kind = 'formation' then
    select q.id, q.formation_id, q.attached_session_id as session_id, q.response_type,
      q.respondent_first_name, q.respondent_last_name, q.respondent_email, q.participants,
      q.positioning_answers, f.organisation_id, f.positioning_questionnaire_document_url
    into r from public.daily_formation_registration_requests q
      join public.daily_formations f on f.id = q.formation_id
    where q.id = p_request_id and q.decision_status = 'accepted'
      and f.status = 'validated' and f.positioning_mode = 'off_platform';
  elsif p_kind = 'session' then
    select q.id, s.formation_id, q.session_id, q.response_type,
      q.respondent_first_name, q.respondent_last_name, q.respondent_email, q.participants,
      q.positioning_answers, f.organisation_id, f.positioning_questionnaire_document_url
    into r from public.daily_registration_responses q
      join public.daily_sessions s on s.id = q.session_id and s.status <> 'archived'
      join public.daily_formations f on f.id = s.formation_id and f.organisation_id = s.organisation_id
    where q.id = p_request_id and q.status = 'submitted'
      and f.status = 'validated' and f.positioning_mode = 'off_platform';
  else return;
  end if;
  if not found or r.session_id is null or r.positioning_answers->>'mode' is distinct from 'off_platform'
    or jsonb_typeof(r.positioning_answers->'external_documents') is distinct from 'array'
    or coalesce(r.positioning_answers->>'source_document_id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return; end if;

  select * into original from public.daily_documents d
  where d.id = (r.positioning_answers->>'source_document_id')::uuid
    and d.organisation_id = r.organisation_id and d.document_type = 'positioning_questionnaire_source'
    and d.linked_object_type = 'organisation' and d.linked_object_id = r.organisation_id
    and d.bucket = 'documents' and d.is_current and d.status <> 'archived'
    and d.storage_path like 'daily/' || r.organisation_id::text || '/%'
    and d.sha256 = r.positioning_answers->>'source_sha256'
    and (d.formation_id is null or d.formation_id = r.formation_id)
    and lower(r.positioning_questionnaire_document_url) = '/api/client/daily/uploads?id=' || d.id::text;
  if not found then return; end if;

  if r.response_type = 'beneficiary' then
    subjects := jsonb_build_array(jsonb_build_object('first_name',r.respondent_first_name,'last_name',r.respondent_last_name,'email',r.respondent_email));
  elsif r.response_type = 'company' and jsonb_typeof(r.participants) = 'array' then
    subjects := r.participants;
  else return;
  end if;
  for proof in select value from jsonb_array_elements(r.positioning_answers->'external_documents') loop
    if coalesce(proof->>'document_id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or coalesce(proof->>'participant_index','') !~ '^[0-9]{1,6}$' then continue; end if;
    v_participant_index := (proof->>'participant_index')::integer;
    subject := subjects->v_participant_index;
    if subject is not null then subject := jsonb_build_object(
      'first_name',coalesce(subject->>'first_name',subject->>'firstname',subject->>'firstName'),
      'last_name',coalesce(subject->>'last_name',subject->>'lastname',subject->>'lastName'),
      'email',coalesce(subject->>'email',subject->>'mail')); end if;
    if subject is null or nullif(btrim(subject->>'email'),'') is null
      or nullif(btrim(subject->>'first_name'),'') is null or nullif(btrim(subject->>'last_name'),'') is null then continue; end if;
    select * into doc from public.daily_documents d
    where d.id = (proof->>'document_id')::uuid and d.organisation_id = r.organisation_id
      and d.formation_id = r.formation_id and d.document_type = 'positioning_application_evidence'
      and d.linked_object_type = case when p_kind='formation' then 'registration_request' else 'registration_response' end
      and d.linked_object_id = r.id and d.is_current and d.status not in ('archived','signed','published')
      and d.signed_at is null and d.published_at is null
      and d.bucket = 'documents' and d.storage_path like 'daily/' || r.organisation_id::text || '/%'
      and d.sha256 = proof->>'sha256' and d.metadata->>'source' = 'daily_own_positioning'
      and d.metadata->>'source_document_id' = original.id::text and d.metadata->>'source_sha256' = original.sha256
      and d.metadata->>'submission_fingerprint' = r.positioning_answers->>'submission_fingerprint'
      and d.metadata->>'participant_index' = v_participant_index::text
      and lower(btrim(d.metadata->>'subject_email')) = lower(btrim(subject->>'email'))
      and lower(btrim(d.metadata->>'subject_first_name')) = lower(btrim(subject->>'first_name'))
      and lower(btrim(d.metadata->>'subject_last_name')) = lower(btrim(subject->>'last_name'));
    if not found then continue; end if;
    for enrol in
      select e.id, e.learner_id from public.daily_session_enrolments e
      join public.daily_sessions s on s.id=e.session_id and s.organisation_id=e.organisation_id
      join public.daily_learners l on l.id=e.learner_id and l.organisation_id=e.organisation_id
      where e.organisation_id=r.organisation_id and e.session_id=r.session_id
        and s.formation_id=r.formation_id and s.status <> 'archived'
        and e.status not in ('declined','cancelled','abandoned')
        and lower(btrim(l.email))=lower(btrim(subject->>'email'))
        and lower(btrim(l.first_name))=lower(btrim(subject->>'first_name'))
        and lower(btrim(l.last_name))=lower(btrim(subject->>'last_name'))
        and (p_kind='session' or exists (select 1 from public.daily_registration_request_enrolments m
          where m.registration_request_id=r.id and m.participant_index=v_participant_index
            and m.enrolment_id=e.id and m.learner_id=e.learner_id
            and lower(btrim(m.participant_email))=lower(btrim(subject->>'email'))))
    loop
      update public.daily_documents set document_type='positioning_evidence', linked_object_type='enrolment', linked_object_id=enrol.id,
        session_id=r.session_id, learner_id=enrol.learner_id, enrolment_id=enrol.id,
        metadata=metadata || jsonb_build_object('source_request_id',r.id,'source_request_kind',p_kind)
      where id=doc.id and document_type='positioning_application_evidence';
    end loop;
  end loop;
end;
$$;
revoke all on function public.daily_attach_own_positioning_candidate(text,uuid) from public, anon, authenticated;
grant execute on function public.daily_attach_own_positioning_candidate(text,uuid) to service_role;

create or replace function public.daily_own_positioning_candidate_trigger()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare candidate record;
begin
  if tg_table_name='daily_registration_request_enrolments' then
    perform public.daily_attach_own_positioning_candidate('formation',new.registration_request_id);
  elsif tg_table_name='daily_formation_registration_requests' then
    perform public.daily_attach_own_positioning_candidate('formation',new.id);
  elsif tg_table_name='daily_registration_responses' then
    perform public.daily_attach_own_positioning_candidate('session',new.id);
  elsif new.status not in ('declined','cancelled','abandoned') then
    for candidate in select id from public.daily_registration_responses
      where session_id=new.session_id and positioning_answers->>'mode'='off_platform'
    loop perform public.daily_attach_own_positioning_candidate('session',candidate.id); end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.daily_own_positioning_candidate_trigger() from public,anon,authenticated;
grant execute on function public.daily_own_positioning_candidate_trigger() to service_role;
create trigger daily_own_positioning_request_enrolment after insert or update on public.daily_registration_request_enrolments
  for each row execute function public.daily_own_positioning_candidate_trigger();
-- Materialisation writes mappings before it finally assigns attached_session_id.
create trigger daily_own_positioning_request_attachment after update of decision_status,attached_session_id,positioning_answers on public.daily_formation_registration_requests
  for each row execute function public.daily_own_positioning_candidate_trigger();
create trigger daily_own_positioning_legacy_response after insert on public.daily_registration_responses
  for each row execute function public.daily_own_positioning_candidate_trigger();
create trigger daily_own_positioning_legacy_enrolment after insert on public.daily_session_enrolments
  for each row execute function public.daily_own_positioning_candidate_trigger();

create or replace function public.daily_own_positioning_progress_trigger()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.document_type='positioning_evidence' and new.is_current and new.bucket='documents' and new.status <> 'archived'
    and new.metadata->>'source' in ('daily_own_positioning','daily_learner_own_positioning') then
    update public.daily_session_enrolments e set positioning_status='completed',updated_at=now()
    from public.daily_sessions s, public.daily_formations f, public.daily_documents original
    where e.id=new.enrolment_id and e.learner_id=new.learner_id and e.session_id=new.session_id
      and e.organisation_id=new.organisation_id and e.status not in ('declined','cancelled','abandoned')
      and new.linked_object_type='enrolment' and new.linked_object_id=e.id
      and e.positioning_status in ('not_started','sent','submitted')
      and s.id=e.session_id and s.organisation_id=e.organisation_id and s.status <> 'archived'
      and f.id=s.formation_id and f.id=new.formation_id and f.organisation_id=e.organisation_id
      and f.positioning_mode='off_platform' and f.status='validated'
      and new.storage_path like 'daily/' || e.organisation_id::text || '/%'
      and lower(f.positioning_questionnaire_document_url)='/api/client/daily/uploads?id=' || original.id::text
      and original.id::text=new.metadata->>'source_document_id' and original.organisation_id=e.organisation_id
      and original.document_type='positioning_questionnaire_source' and original.bucket='documents' and original.is_current
      and original.linked_object_type='organisation' and original.linked_object_id=e.organisation_id
      and (original.formation_id is null or original.formation_id=f.id)
      and original.storage_path like 'daily/' || e.organisation_id::text || '/%'
      and original.status <> 'archived' and original.sha256=new.metadata->>'source_sha256';
  end if;
  return new;
end;
$$;
revoke all on function public.daily_own_positioning_progress_trigger() from public,anon,authenticated;
grant execute on function public.daily_own_positioning_progress_trigger() to service_role;
create trigger daily_own_positioning_progress after insert or update on public.daily_documents
  for each row execute function public.daily_own_positioning_progress_trigger();

create or replace function public.daily_own_positioning_formation_trigger()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare candidate record;
begin
  if new.positioning_mode='off_platform' and nullif(btrim(new.positioning_questionnaire_document_url),'') is not null
    and (new.positioning_questionnaire_document_url is distinct from old.positioning_questionnaire_document_url or old.positioning_mode <> 'off_platform') then
    -- Keep the bytes, request proofs and any signed history. Only an unsigned
    -- previous positioning ceases to be the current version.
    update public.daily_documents set is_current=false
    where formation_id=new.id and organisation_id=new.organisation_id and document_type='positioning_evidence'
      and metadata->>'source' in ('daily_own_positioning','daily_learner_own_positioning') and status <> 'signed'
      and '/api/client/daily/uploads?id=' || coalesce(metadata->>'source_document_id','') = lower(coalesce(old.positioning_questionnaire_document_url,''));
    update public.daily_session_enrolments e set positioning_status='not_started',updated_at=now()
    from public.daily_sessions s where s.id=e.session_id and s.formation_id=new.id and s.organisation_id=new.organisation_id
      and e.organisation_id=new.organisation_id and e.status in ('invited','pending','confirmed') and s.status <> 'archived';
  end if;
  if new.status='validated' and old.status is distinct from 'validated' and new.positioning_mode='off_platform' then
    for candidate in select id from public.daily_formation_registration_requests
      where formation_id=new.id and decision_status='accepted' and positioning_answers->>'mode'='off_platform'
    loop perform public.daily_attach_own_positioning_candidate('formation',candidate.id); end loop;
    for candidate in select q.id from public.daily_registration_responses q join public.daily_sessions s on s.id=q.session_id
      where s.formation_id=new.id and s.organisation_id=new.organisation_id and q.positioning_answers->>'mode'='off_platform'
    loop perform public.daily_attach_own_positioning_candidate('session',candidate.id); end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.daily_own_positioning_formation_trigger() from public,anon,authenticated;
grant execute on function public.daily_own_positioning_formation_trigger() to service_role;
create trigger daily_own_positioning_formation_version after update of positioning_mode,positioning_questionnaire_document_url,status on public.daily_formations
  for each row execute function public.daily_own_positioning_formation_trigger();
