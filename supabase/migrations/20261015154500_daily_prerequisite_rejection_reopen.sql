-- Reopen an automatically completed prerequisite task when its last valid
-- mandatory evidence is rejected.  Keep an append-only transition history so
-- a later manual decision is never inferred from the current value alone.
create table if not exists public.daily_prerequisite_status_events (
  id bigint generated always as identity primary key,
  enrolment_id uuid not null,
  registration_request_id uuid,
  evidence_id uuid,
  event_type text not null check (event_type in ('auto_met', 'auto_reopened', 'manual_change')),
  previous_status text,
  new_status text not null,
  actor_user_id uuid,
  occurred_at timestamptz not null default now()
);

create index if not exists daily_prerequisite_status_events_latest_idx
  on public.daily_prerequisite_status_events(enrolment_id, occurred_at desc, id desc);

alter table public.daily_prerequisite_status_events enable row level security;
revoke all on public.daily_prerequisite_status_events from public, anon, authenticated;
grant select, insert on public.daily_prerequisite_status_events to service_role;
grant usage, select on sequence public.daily_prerequisite_status_events_id_seq to service_role;

create or replace function public.daily_track_manual_prerequisite_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
begin
  if old.prerequisites_status is distinct from new.prerequisites_status
     and coalesce(current_setting('app.daily_prerequisite_transition', true), '')
         not in ('auto_met', 'auto_reopened') then
    select mapping.registration_request_id
      into request_id
      from public.daily_registration_request_enrolments mapping
     where mapping.enrolment_id = new.id
     order by mapping.id
     limit 1;

    insert into public.daily_prerequisite_status_events (
      enrolment_id, registration_request_id, event_type,
      previous_status, new_status, actor_user_id
    ) values (
      new.id, request_id, 'manual_change',
      old.prerequisites_status, new.prerequisites_status, auth.uid()
    );
  end if;
  return new;
end;
$$;

revoke all on function public.daily_track_manual_prerequisite_status()
  from public, anon, authenticated;
grant execute on function public.daily_track_manual_prerequisite_status()
  to service_role;

drop trigger if exists daily_track_manual_prerequisite_status
  on public.daily_session_enrolments;
create trigger daily_track_manual_prerequisite_status
after update of prerequisites_status on public.daily_session_enrolments
for each row execute function public.daily_track_manual_prerequisite_status();

create or replace function public.daily_sync_materialized_prerequisite_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  contract jsonb;
  request_status text;
  participant jsonb;
  requirement jsonb;
  previous_status text;
begin
  select r.prerequisite_contract, r.decision_status
    into contract, request_status
    from public.daily_formation_registration_requests r
   where r.id = new.registration_request_id;

  if request_status is distinct from 'accepted'
     or contract is null or contract->>'version' <> '1'
     or contract->>'mode' not in ('none', 'required')
     or jsonb_typeof(contract->'participants') <> 'array'
     or jsonb_typeof(contract->'requirements') <> 'array'
     or jsonb_array_length(contract->'participants') = 0 then
    return new;
  end if;

  for participant in select value from jsonb_array_elements(contract->'participants') loop
    if nullif(participant->>'key', '') is null then return new; end if;
    for requirement in select value from jsonb_array_elements(contract->'requirements')
      where coalesce((value->>'required')::boolean, true)
    loop
      if not exists (
        select 1 from public.daily_prerequisite_evidence evidence
         where evidence.registration_request_id = new.registration_request_id
           and evidence.registration_response_id is null
           and evidence.participant_key = participant->>'key'
           and evidence.requirement_id = btrim(requirement->>'id')
           and evidence.requirement_label = btrim(requirement->>'label')
           and evidence.document_id is not null
           and evidence.status = 'verified'
      ) then
        return new;
      end if;
    end loop;
  end loop;

  perform set_config('app.daily_prerequisite_transition', 'auto_met', true);
  update public.daily_session_enrolments enrolment
     set prerequisites_status = 'met'
   where enrolment.id = new.enrolment_id
     and enrolment.prerequisites_status = 'not_reviewed'
  returning 'not_reviewed' into previous_status;
  perform set_config('app.daily_prerequisite_transition', '', true);

  if previous_status is not null then
    insert into public.daily_prerequisite_status_events (
      enrolment_id, registration_request_id, event_type,
      previous_status, new_status, actor_user_id
    ) values (
      new.enrolment_id, new.registration_request_id, 'auto_met',
      previous_status, 'met', auth.uid()
    );
  end if;
  return new;
end;
$$;

revoke all on function public.daily_sync_materialized_prerequisite_status()
  from public, anon, authenticated;
grant execute on function public.daily_sync_materialized_prerequisite_status()
  to service_role;

create or replace function public.daily_resync_prerequisites_after_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  mapping record;
  last_event_type text;
begin
  if new.registration_request_id is not null
     and new.status = 'verified'
     and old.status is distinct from new.status then
    update public.daily_registration_request_enrolments current_mapping
       set enrolment_id = current_mapping.enrolment_id
     where current_mapping.registration_request_id = new.registration_request_id;
  end if;

  if new.registration_request_id is not null
     and new.status = 'rejected'
     and old.status = 'verified'
     and not exists (
       select 1
         from public.daily_prerequisite_evidence replacement
        where replacement.registration_request_id = new.registration_request_id
          and replacement.registration_response_id is null
          and replacement.participant_key = new.participant_key
          and replacement.requirement_id = new.requirement_id
          and replacement.requirement_label = new.requirement_label
          and replacement.document_id is not null
          and replacement.status = 'verified'
     ) then
    for mapping in
      select current_mapping.enrolment_id
        from public.daily_registration_request_enrolments current_mapping
        join public.daily_session_enrolments enrolment
          on enrolment.id = current_mapping.enrolment_id
       where current_mapping.registration_request_id = new.registration_request_id
         and enrolment.prerequisites_status = 'met'
    loop
      select event.event_type
        into last_event_type
        from public.daily_prerequisite_status_events event
       where event.enrolment_id = mapping.enrolment_id
       order by event.occurred_at desc, event.id desc
       limit 1;

      if last_event_type = 'auto_met' then
        perform set_config('app.daily_prerequisite_transition', 'auto_reopened', true);
        update public.daily_session_enrolments
           set prerequisites_status = 'not_reviewed'
         where id = mapping.enrolment_id
           and prerequisites_status = 'met';
        perform set_config('app.daily_prerequisite_transition', '', true);

        if found then
          insert into public.daily_prerequisite_status_events (
            enrolment_id, registration_request_id, evidence_id, event_type,
            previous_status, new_status, actor_user_id
          ) values (
            mapping.enrolment_id, new.registration_request_id, new.document_id,
            'auto_reopened', 'met', 'not_reviewed', auth.uid()
          );
        end if;
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function public.daily_resync_prerequisites_after_review()
  from public, anon, authenticated;
grant execute on function public.daily_resync_prerequisites_after_review()
  to service_role;

comment on table public.daily_prerequisite_status_events is
  'Append-only audit of automatic and manual prerequisite status transitions; no historical status is inferred or rewritten.';
