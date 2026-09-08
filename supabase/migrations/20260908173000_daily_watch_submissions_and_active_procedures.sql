-- Procédures internes : les modèles Selen sont utilisables immédiatement.
alter table public.daily_internal_procedures
  alter column status set default 'active';

update public.daily_internal_procedures
set status = 'active',
    reviewed_at = coalesce(reviewed_at, now()),
    updated_at = now()
where procedure_type in ('learner_administration','stakeholder_satisfaction','absence_dropout','difficulties_hazards')
  and status = 'draft';

-- Contributions de veille proposées par les organismes Daily.
create table if not exists public.daily_watch_submissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  watch_type text not null check (watch_type in ('regulatory','pedagogy','technology')),
  title text not null,
  source_url text null,
  summary text null,
  analysis_and_improvement text null,
  share_requested boolean not null default false,
  status text not null default 'private' check (status in ('private','pending','approved','rejected')),
  studio_review_note text null,
  reviewed_by_agent_profile_id uuid null references public.agent_profiles(id) on delete set null,
  reviewed_at timestamptz null,
  published_watch_entry_id uuid null references public.daily_watch_entries(id) on delete set null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_watch_submissions_org_idx
  on public.daily_watch_submissions(organisation_id, created_at desc);
create index if not exists daily_watch_submissions_pending_idx
  on public.daily_watch_submissions(status, created_at desc)
  where status = 'pending';

alter table public.daily_watch_submissions enable row level security;

drop policy if exists daily_watch_submissions_read on public.daily_watch_submissions;
create policy daily_watch_submissions_read on public.daily_watch_submissions for select to authenticated
using (
  public.daily_is_selen_staff()
  or exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = daily_watch_submissions.organisation_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  )
);

drop policy if exists daily_watch_submissions_client_insert on public.daily_watch_submissions;
create policy daily_watch_submissions_client_insert on public.daily_watch_submissions for insert to authenticated
with check (
  exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = daily_watch_submissions.organisation_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  )
  and status in ('private','pending')
  and reviewed_by_agent_profile_id is null
  and reviewed_at is null
  and published_watch_entry_id is null
);

drop policy if exists daily_watch_submissions_client_update on public.daily_watch_submissions;
create policy daily_watch_submissions_client_update on public.daily_watch_submissions for update to authenticated
using (
  status in ('private','pending')
  and exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = daily_watch_submissions.organisation_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  )
)
with check (
  status in ('private','pending')
  and reviewed_by_agent_profile_id is null
  and reviewed_at is null
  and published_watch_entry_id is null
  and exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = daily_watch_submissions.organisation_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  )
);

drop policy if exists daily_watch_submissions_staff_all on public.daily_watch_submissions;
create policy daily_watch_submissions_staff_all on public.daily_watch_submissions for all to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

grant select, insert, update on public.daily_watch_submissions to authenticated;
grant all on public.daily_watch_submissions to service_role;
