alter table public.organisations
  add column if not exists daily_task_reminder_mode text not null default 'daily_digest'
    check (daily_task_reminder_mode in ('immediate','daily_digest')),
  add column if not exists daily_task_digest_hour smallint not null default 7
    check (daily_task_digest_hour between 0 and 23);

create table if not exists public.daily_watch_entries (
  id uuid primary key default gen_random_uuid(),
  watch_type text not null check (watch_type in ('regulatory','pedagogy_technology')),
  title text not null,
  article_url text not null,
  published_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid null references public.agent_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_organisation_watch_entries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  watch_entry_id uuid not null references public.daily_watch_entries(id) on delete cascade,
  interested boolean not null default false,
  interested_at timestamptz null,
  improvement_note text null,
  forced_by_studio boolean not null default false,
  forced_by_agent_profile_id uuid null references public.agent_profiles(id) on delete set null,
  forced_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, watch_entry_id)
);

create table if not exists public.daily_business_watch_entries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  watch_date date not null default current_date,
  title text not null,
  source_url text null,
  description text null,
  interest_note text null,
  improvement_note text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_watch_entries_type_published_idx on public.daily_watch_entries(watch_type, published_at desc);
create index if not exists daily_org_watch_org_idx on public.daily_organisation_watch_entries(organisation_id, updated_at desc);
create index if not exists daily_business_watch_org_date_idx on public.daily_business_watch_entries(organisation_id, watch_date desc);

alter table public.daily_watch_entries enable row level security;
alter table public.daily_organisation_watch_entries enable row level security;
alter table public.daily_business_watch_entries enable row level security;

drop policy if exists daily_watch_entries_read on public.daily_watch_entries;
create policy daily_watch_entries_read on public.daily_watch_entries for select to authenticated
using (
  public.daily_is_selen_staff()
  or exists (
    select 1 from public.organisation_memberships m
    where m.user_id = (select auth.uid()) and m.status = 'active'
  )
);

drop policy if exists daily_watch_entries_staff_write on public.daily_watch_entries;
create policy daily_watch_entries_staff_write on public.daily_watch_entries for all to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists daily_org_watch_read on public.daily_organisation_watch_entries;
create policy daily_org_watch_read on public.daily_organisation_watch_entries for select to authenticated
using (
  public.daily_is_selen_staff()
  or exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = daily_organisation_watch_entries.organisation_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  )
);

drop policy if exists daily_org_watch_client_insert on public.daily_organisation_watch_entries;
create policy daily_org_watch_client_insert on public.daily_organisation_watch_entries for insert to authenticated
with check (
  exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = daily_organisation_watch_entries.organisation_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  )
  and forced_by_studio = false
  and forced_by_agent_profile_id is null
  and forced_at is null
);

drop policy if exists daily_org_watch_client_update on public.daily_organisation_watch_entries;
create policy daily_org_watch_client_update on public.daily_organisation_watch_entries for update to authenticated
using (
  exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = daily_organisation_watch_entries.organisation_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = daily_organisation_watch_entries.organisation_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  )
);

drop policy if exists daily_org_watch_staff_all on public.daily_organisation_watch_entries;
create policy daily_org_watch_staff_all on public.daily_organisation_watch_entries for all to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists daily_business_watch_read on public.daily_business_watch_entries;
create policy daily_business_watch_read on public.daily_business_watch_entries for select to authenticated
using (
  public.daily_is_selen_staff()
  or exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = daily_business_watch_entries.organisation_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  )
);

drop policy if exists daily_business_watch_client_write on public.daily_business_watch_entries;
create policy daily_business_watch_client_write on public.daily_business_watch_entries for all to authenticated
using (
  exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = daily_business_watch_entries.organisation_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = daily_business_watch_entries.organisation_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  )
);

drop policy if exists daily_business_watch_staff_all on public.daily_business_watch_entries;
create policy daily_business_watch_staff_all on public.daily_business_watch_entries for all to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

grant select on public.daily_watch_entries to authenticated;
grant select, insert, update on public.daily_organisation_watch_entries to authenticated;
grant select, insert, update, delete on public.daily_business_watch_entries to authenticated;
grant all on public.daily_watch_entries, public.daily_organisation_watch_entries, public.daily_business_watch_entries to service_role;
