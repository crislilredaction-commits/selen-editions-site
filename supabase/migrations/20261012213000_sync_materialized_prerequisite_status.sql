-- Synchronize the learner task state only for accepted, fully verified dossiers.
-- The trigger runs inside the materialization transaction, after each mapping is written.
create table if not exists public.daily_auto_prerequisite_reviews (
  enrolment_id uuid primary key references public.daily_session_enrolments(id) on delete cascade,
  registration_request_id uuid not null references public.daily_formation_registration_requests(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.daily_auto_prerequisite_reviews enable row level security;
revoke all on public.daily_auto_prerequisite_reviews from public, anon, authenticated;

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
  updated_rows integer;
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

  -- Require exact coverage for every mandatory requirement of every participant.
  for participant in select value from jsonb_array_elements(contract->'participants') loop
    if nullif(participant->>'key', '') is null then return new; end if;
    for requirement in select value from jsonb_array_elements(contract->'requirements')
      where coalesce((value->>'required')::boolean, true)
    loop
      if not exists (
        select 1 from public.daily_prerequisite_evidence e
         where e.registration_request_id = new.registration_request_id
           and e.registration_response_id is null
           and e.participant_key = participant->>'key'
           and e.requirement_id = btrim(requirement->>'id')
           and e.requirement_label = btrim(requirement->>'label')
           and e.document_id is not null and e.status = 'verified'
      ) then
        return new;
      end if;
    end loop;
  end loop;

  -- Do not overwrite a subsequent manual rejection or clarification.
  update public.daily_session_enrolments e
     set prerequisites_status = 'met'
   where e.id = new.enrolment_id
     and e.prerequisites_status = 'not_reviewed';
  get diagnostics updated_rows = row_count;
  if updated_rows > 0 then
    insert into public.daily_auto_prerequisite_reviews (enrolment_id, registration_request_id)
    values (new.enrolment_id, new.registration_request_id)
    on conflict (enrolment_id) do update
      set registration_request_id = excluded.registration_request_id;
  end if;
  return new;
end;
$$;

revoke all on function public.daily_sync_materialized_prerequisite_status()
  from public, anon, authenticated;
grant execute on function public.daily_sync_materialized_prerequisite_status()
  to service_role;

drop trigger if exists daily_sync_materialized_prerequisites
  on public.daily_registration_request_enrolments;
create trigger daily_sync_materialized_prerequisites
after insert or update of enrolment_id on public.daily_registration_request_enrolments
for each row execute function public.daily_sync_materialized_prerequisite_status();
