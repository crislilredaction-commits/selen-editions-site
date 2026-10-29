create table if not exists public.daily_positioning_responses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  enrolment_id uuid not null references public.daily_session_enrolments(id) on delete cascade,
  formation_id uuid not null references public.daily_formations(id) on delete cascade,
  question_snapshot jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_positioning_responses_enrolment_unique unique (enrolment_id)
);

create index if not exists daily_positioning_responses_session_idx on public.daily_positioning_responses(session_id);
create index if not exists daily_positioning_responses_organisation_idx on public.daily_positioning_responses(organisation_id);

alter table public.daily_positioning_responses enable row level security;
revoke all on public.daily_positioning_responses from anon, authenticated;

create or replace function public.sync_daily_positioning_status()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.daily_session_enrolments
  set positioning_status = 'completed', updated_at = now()
  where id = new.enrolment_id
    and session_id = new.session_id
    and organisation_id = new.organisation_id;
  return new;
end;
$$;

revoke all on function public.sync_daily_positioning_status() from public, anon, authenticated;
grant execute on function public.sync_daily_positioning_status() to service_role;

drop trigger if exists trg_sync_daily_positioning_status on public.daily_positioning_responses;
create trigger trg_sync_daily_positioning_status
after insert or update on public.daily_positioning_responses
for each row execute function public.sync_daily_positioning_status();
