-- Freeze the prerequisite contract and participant identities per submitted dossier.
-- Updating a validated formation then affects only future dossiers.

alter table public.daily_formation_registration_requests
  add column if not exists prerequisite_contract jsonb;
alter table public.daily_registration_responses
  add column if not exists prerequisite_contract jsonb;
alter table public.daily_prerequisite_evidence
  add column if not exists participant_key text;

create or replace function public.daily_build_prerequisite_contract(
  p_mode text,
  p_requirements jsonb,
  p_response_type text,
  p_participants jsonb,
  p_first_name text,
  p_last_name text,
  p_email text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with subjects as (
    select ordinal - 1 as participant_index,
      lower(btrim(coalesce(value->>'email', value->>'mail', ''))) as email,
      btrim(coalesce(value->>'first_name', value->>'firstname', value->>'firstName', '')) as first_name,
      btrim(coalesce(value->>'last_name', value->>'lastname', value->>'lastName', '')) as last_name
    from jsonb_array_elements(
      case when p_response_type = 'company' then coalesce(p_participants, '[]'::jsonb)
      else jsonb_build_array(jsonb_build_object('email', p_email, 'first_name', p_first_name, 'last_name', p_last_name)) end
    ) with ordinality as item(value, ordinal)
  )
  select jsonb_build_object(
    'version', 1,
    'mode', case when p_mode = 'required' then 'required' else 'none' end,
    'requirements', case when p_mode = 'required' then coalesce(p_requirements, '[]'::jsonb) else '[]'::jsonb end,
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'index', participant_index,
      'key', encode(extensions.digest(email, 'sha256'), 'hex'),
      'email', email,
      'first_name', first_name,
      'last_name', last_name
    ) order by participant_index) from subjects), '[]'::jsonb)
  );
$$;

revoke all on function public.daily_build_prerequisite_contract(text,jsonb,text,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.daily_build_prerequisite_contract(text,jsonb,text,jsonb,text,text,text) to service_role;

create or replace function public.daily_snapshot_prerequisite_contract()
returns trigger
language plpgsql
set search_path = ''
as $$
declare f record;
begin
  if new.prerequisite_contract is not null then return new; end if;
  if tg_table_name = 'daily_formation_registration_requests' then
    select prerequisite_mode, prerequisite_requirements into f
      from public.daily_formations where id = new.formation_id;
  else
    select f0.prerequisite_mode, f0.prerequisite_requirements into f
      from public.daily_sessions s join public.daily_formations f0 on f0.id = s.formation_id
     where s.id = new.session_id;
  end if;
  if not found then raise exception using errcode = 'PSE01', message = 'Formation du dossier introuvable.'; end if;
  new.prerequisite_contract := public.daily_build_prerequisite_contract(
    f.prerequisite_mode, f.prerequisite_requirements, new.response_type, new.participants,
    new.respondent_first_name, new.respondent_last_name, new.respondent_email
  );
  return new;
end;
$$;

revoke all on function public.daily_snapshot_prerequisite_contract() from public, anon, authenticated;
grant execute on function public.daily_snapshot_prerequisite_contract() to service_role;

drop trigger if exists daily_snapshot_request_prerequisite_contract on public.daily_formation_registration_requests;
create trigger daily_snapshot_request_prerequisite_contract
before insert on public.daily_formation_registration_requests
for each row execute function public.daily_snapshot_prerequisite_contract();

drop trigger if exists daily_snapshot_response_prerequisite_contract on public.daily_registration_responses;
create trigger daily_snapshot_response_prerequisite_contract
before insert on public.daily_registration_responses
for each row execute function public.daily_snapshot_prerequisite_contract();

-- Existing dossiers are frozen to the exact configuration visible immediately
-- before this additive migration. No formation, session, enrolment or document is changed.
update public.daily_formation_registration_requests r
set prerequisite_contract = public.daily_build_prerequisite_contract(
  f.prerequisite_mode, f.prerequisite_requirements, r.response_type, r.participants,
  r.respondent_first_name, r.respondent_last_name, r.respondent_email
)
from public.daily_formations f
where f.id = r.formation_id and r.prerequisite_contract is null;

update public.daily_registration_responses r
set prerequisite_contract = public.daily_build_prerequisite_contract(
  f.prerequisite_mode, f.prerequisite_requirements, r.response_type, r.participants,
  r.respondent_first_name, r.respondent_last_name, r.respondent_email
)
from public.daily_sessions s join public.daily_formations f on f.id = s.formation_id
where s.id = r.session_id and r.prerequisite_contract is null;

create or replace function public.daily_keep_prerequisite_contract_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.prerequisite_contract is distinct from new.prerequisite_contract then
    raise exception using errcode = '23514', message = 'Le contrat de prérequis du dossier est immuable.';
  end if;
  return new;
end;
$$;

revoke all on function public.daily_keep_prerequisite_contract_immutable() from public, anon, authenticated;
grant execute on function public.daily_keep_prerequisite_contract_immutable() to service_role;

drop trigger if exists daily_keep_request_prerequisite_contract on public.daily_formation_registration_requests;
create trigger daily_keep_request_prerequisite_contract before update on public.daily_formation_registration_requests
for each row execute function public.daily_keep_prerequisite_contract_immutable();
drop trigger if exists daily_keep_response_prerequisite_contract on public.daily_registration_responses;
create trigger daily_keep_response_prerequisite_contract before update on public.daily_registration_responses
for each row execute function public.daily_keep_prerequisite_contract_immutable();

create or replace function public.daily_seed_prerequisite_participant_key()
returns trigger
language plpgsql
set search_path = ''
as $$
declare contract jsonb;
begin
  if new.participant_key is not null then return new; end if;
  if new.registration_request_id is not null then
    select prerequisite_contract into contract from public.daily_formation_registration_requests where id = new.registration_request_id;
  else
    select prerequisite_contract into contract from public.daily_registration_responses where id = new.registration_response_id;
  end if;
  new.participant_key := contract->'participants'->new.participant_index->>'key';
  if coalesce(new.participant_key, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '23514', message = 'Identité stable de l’apprenant absente.';
  end if;
  return new;
end;
$$;

revoke all on function public.daily_seed_prerequisite_participant_key() from public, anon, authenticated;
grant execute on function public.daily_seed_prerequisite_participant_key() to service_role;

drop trigger if exists daily_seed_prerequisite_participant_key on public.daily_prerequisite_evidence;
create trigger daily_seed_prerequisite_participant_key before insert or update of participant_index, registration_request_id, registration_response_id
on public.daily_prerequisite_evidence for each row execute function public.daily_seed_prerequisite_participant_key();

create index if not exists daily_prerequisite_evidence_participant_key_idx
  on public.daily_prerequisite_evidence(participant_key, requirement_id);

create or replace function public.daily_update_formation_prerequisites(
  p_formation_id uuid,
  p_organisation_id uuid,
  p_expected_updated_at timestamptz,
  p_mode text,
  p_requirements jsonb
)
returns table(id uuid, status text, updated_at timestamptz)
language plpgsql
set search_path = ''
as $$
declare current_row public.daily_formations%rowtype;
begin
  if p_mode not in ('none', 'required')
     or jsonb_typeof(coalesce(p_requirements, '[]'::jsonb)) <> 'array'
     or (p_mode = 'none' and jsonb_array_length(coalesce(p_requirements, '[]'::jsonb)) <> 0)
     or (p_mode = 'required' and jsonb_array_length(coalesce(p_requirements, '[]'::jsonb)) = 0) then
    raise exception using errcode = '22023', message = 'Configuration des justificatifs invalide.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_requirements, '[]'::jsonb)) r
    where coalesce(btrim(r->>'id'), '') = '' or coalesce(btrim(r->>'label'), '') = ''
  ) or (select count(*) from jsonb_array_elements(coalesce(p_requirements, '[]'::jsonb))) <>
       (select count(distinct r->>'id') from jsonb_array_elements(coalesce(p_requirements, '[]'::jsonb)) r) then
    raise exception using errcode = '22023', message = 'Les justificatifs doivent avoir des identifiants uniques et des intitulés.';
  end if;

  select * into current_row from public.daily_formations
   where daily_formations.id = p_formation_id and organisation_id = p_organisation_id for update;
  if not found then raise exception using errcode = 'PSE01', message = 'Formation introuvable.'; end if;
  if current_row.status not in ('draft','review','correction_requested','validated') then
    raise exception using errcode = 'PSE01', message = 'Cette formation ne peut plus être modifiée.';
  end if;
  if current_row.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'La formation a changé. Rechargez le dossier.';
  end if;

  update public.daily_formations f
     set prerequisite_mode = p_mode,
         prerequisite_requirements = case when p_mode = 'required' then p_requirements else '[]'::jsonb end,
         updated_at = now()
   where f.id = p_formation_id and f.organisation_id = p_organisation_id
     and f.updated_at = p_expected_updated_at
  returning f.id, f.status, f.updated_at into id, status, updated_at;
  if not found then raise exception using errcode = '40001', message = 'La formation a changé. Rechargez le dossier.'; end if;
  return next;
end;
$$;

revoke all on function public.daily_update_formation_prerequisites(uuid,uuid,timestamptz,text,jsonb) from public, anon, authenticated;
grant execute on function public.daily_update_formation_prerequisites(uuid,uuid,timestamptz,text,jsonb) to service_role;

-- The existing AFTER INSERT seeder now reads the immutable dossier contract,
-- never the mutable formation configuration.
create or replace function public.seed_daily_prerequisite_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
#variable_conflict use_variable
declare
  formation_id uuid; organisation_id uuid; session_id uuid; request_id uuid; response_id uuid;
  fingerprint text; link_type text; contract jsonb; participant jsonb; requirement jsonb;
  participant_index integer; participant_key text; requirement_id text; requirement_label text;
  requirement_required boolean; configured_count integer := 0; selected_count integer := 0;
  matching_count integer; matching_document_id uuid;
begin
  contract := new.prerequisite_contract;
  if contract is null or contract->>'version' <> '1' then
    raise exception using errcode = '23514', message = 'Le contrat de prérequis du dossier est absent.';
  end if;
  if tg_table_name = 'daily_formation_registration_requests' then
    request_id := new.id; response_id := null; formation_id := new.formation_id;
    session_id := new.attached_session_id; fingerprint := new.prerequisite_submission_fingerprint;
    link_type := 'registration_request';
    select x.organisation_id into organisation_id from public.daily_formations x where x.id = formation_id;
  else
    request_id := null; response_id := new.id; session_id := new.session_id;
    fingerprint := new.prerequisite_submission_fingerprint; link_type := 'registration_response';
    select x.formation_id, x.organisation_id into formation_id, organisation_id from public.daily_sessions x where x.id = session_id;
  end if;
  if not found then raise exception using errcode = 'PSE01', message = 'Formation du dossier introuvable.'; end if;
  if contract->>'mode' <> 'required' then return new; end if;
  if fingerprint is null or fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '23514', message = 'La version des justificatifs de prérequis est absente.';
  end if;
  if jsonb_array_length(coalesce(contract->'requirements', '[]'::jsonb)) = 0
     or jsonb_array_length(coalesce(contract->'participants', '[]'::jsonb)) = 0 then
    raise exception using errcode = '23514', message = 'Le contrat de prérequis est incomplet.';
  end if;

  for participant in select value from jsonb_array_elements(contract->'participants') loop
    participant_index := (participant->>'index')::integer;
    participant_key := participant->>'key';
    if participant_key !~ '^[0-9a-f]{64}$' then raise exception using errcode = '23514', message = 'Identité stable de l’apprenant absente.'; end if;
    for requirement in select value from jsonb_array_elements(contract->'requirements') loop
      configured_count := configured_count + 1;
      requirement_id := btrim(requirement->>'id'); requirement_label := btrim(requirement->>'label');
      requirement_required := coalesce((requirement->>'required')::boolean, true);
      select count(*)::integer, min(d.id::text)::uuid into matching_count, matching_document_id
        from public.daily_documents d
       where d.organisation_id = organisation_id and d.formation_id = formation_id
         and d.session_id is not distinct from session_id
         and d.document_type = 'prerequisite_application_evidence'
         and d.linked_object_type = link_type and d.linked_object_id = new.id
         and d.bucket = 'documents' and d.is_current and d.status <> 'archived'
         and d.sha256 ~ '^[0-9a-f]{64}$' and d.metadata->>'source' = 'daily_prerequisite_evidence'
         and d.metadata->>'submission_fingerprint' = fingerprint
         and coalesce(d.metadata->>'staged_replacement', 'false') = 'false'
         and d.metadata->>'participant_key' = participant_key
         and d.metadata->>'requirement_id' = requirement_id;
      if matching_count > 1 or (requirement_required and matching_count <> 1) then
        raise exception using errcode = '23514', message = 'Chaque justificatif obligatoire doit avoir exactement un fichier privé valide.';
      end if;
      if matching_count = 1 then
        selected_count := selected_count + 1;
        insert into public.daily_prerequisite_evidence (
          registration_request_id, registration_response_id, participant_index, participant_key,
          requirement_id, requirement_label, document_id, status, submitted_at
        ) values (request_id, response_id, participant_index, participant_key, requirement_id, requirement_label, matching_document_id, 'submitted', now())
        on conflict do nothing;
      end if;
    end loop;
  end loop;
  select count(*)::integer into matching_count from public.daily_documents d
   where d.organisation_id = organisation_id and d.formation_id = formation_id
     and d.session_id is not distinct from session_id
     and d.document_type = 'prerequisite_application_evidence'
     and d.linked_object_type = link_type and d.linked_object_id = new.id
     and d.is_current and d.status <> 'archived' and d.metadata->>'source' = 'daily_prerequisite_evidence'
     and d.metadata->>'submission_fingerprint' = fingerprint
     and coalesce(d.metadata->>'staged_replacement', 'false') = 'false';
  if configured_count = 0 or matching_count <> selected_count then
    raise exception using errcode = '23514', message = 'Le jeu de justificatifs ne correspond pas au contrat du dossier.';
  end if;
  return new;
end;
$$;

revoke all on function public.seed_daily_prerequisite_evidence() from public, anon, authenticated;
grant execute on function public.seed_daily_prerequisite_evidence() to service_role;

create or replace function public.guard_daily_registration_prerequisite_acceptance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare participant jsonb; requirement jsonb; contract jsonb;
begin
  if new.decision_status <> 'accepted' or old.decision_status = 'accepted' then return new; end if;
  contract := new.prerequisite_contract;
  if contract is null or contract->>'version' <> '1' then
    raise exception using errcode = '23514', message = 'Le contrat de prérequis du dossier est absent.';
  end if;
  if contract->>'mode' <> 'required' then return new; end if;
  for participant in select value from jsonb_array_elements(coalesce(contract->'participants', '[]'::jsonb)) loop
    for requirement in select value from jsonb_array_elements(coalesce(contract->'requirements', '[]'::jsonb))
      where coalesce((value->>'required')::boolean, true)
    loop
      if not exists (
        select 1 from public.daily_prerequisite_evidence e
         where e.registration_request_id = new.id and e.registration_response_id is null
           and e.participant_key = participant->>'key'
           and e.requirement_id = btrim(requirement->>'id')
           and e.requirement_label = btrim(requirement->>'label')
           and e.document_id is not null and e.status = 'verified'
      ) then
        raise exception using errcode = '23514', message = 'Impossible d’accepter la candidature : les justificatifs obligatoires du dossier doivent être vérifiés humainement.';
      end if;
    end loop;
  end loop;
  return new;
end;
$$;

revoke all on function public.guard_daily_registration_prerequisite_acceptance() from public, anon, authenticated;
grant execute on function public.guard_daily_registration_prerequisite_acceptance() to service_role;

