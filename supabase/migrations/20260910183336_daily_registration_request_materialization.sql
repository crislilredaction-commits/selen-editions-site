alter table public.daily_formation_registration_requests
  add column if not exists materialized_at timestamptz;

create table if not exists public.daily_registration_request_enrolments (
  id uuid primary key default gen_random_uuid(),
  registration_request_id uuid not null references public.daily_formation_registration_requests(id) on delete cascade,
  participant_index integer not null check (participant_index >= 0),
  participant_email text not null check (btrim(participant_email) <> ''),
  learner_id uuid not null references public.daily_learners(id) on delete restrict,
  enrolment_id uuid not null references public.daily_session_enrolments(id) on delete restrict,
  materialized_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (registration_request_id, participant_index),
  unique (registration_request_id, participant_email),
  unique (enrolment_id)
);

alter table public.daily_registration_request_enrolments enable row level security;
revoke all on table public.daily_registration_request_enrolments from public, anon, authenticated;
grant select, insert, update, delete on table public.daily_registration_request_enrolments to service_role;

create or replace function public.daily_materialize_registration_request(
  p_request_id uuid,
  p_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.daily_materialize_registration_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.daily_materialize_registration_request(uuid, uuid) to service_role;
