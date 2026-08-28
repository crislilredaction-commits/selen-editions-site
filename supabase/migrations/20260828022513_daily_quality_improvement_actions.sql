create table if not exists public.daily_quality_actions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid null references public.daily_sessions(id) on delete set null,
  category text not null check (category in ('incident','difficulty','complaint','corrective_action','improvement')),
  source_type text null,
  source_id uuid null,
  title text not null,
  observation text null,
  proposed_solution text null,
  implemented_improvement text null,
  status text not null default 'open' check (status in ('open','planned','implemented','closed')),
  created_by uuid null,
  updated_by uuid null,
  implemented_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists daily_quality_actions_org_created_idx on public.daily_quality_actions(organisation_id, created_at desc);
alter table public.daily_quality_actions enable row level security;
drop policy if exists daily_quality_actions_member_read on public.daily_quality_actions;
create policy daily_quality_actions_member_read on public.daily_quality_actions for select to authenticated
using (public.daily_is_selen_staff() or exists(select 1 from public.organisation_memberships m where m.organisation_id=daily_quality_actions.organisation_id and m.user_id=(select auth.uid()) and m.status='active'));
drop policy if exists daily_quality_actions_member_write on public.daily_quality_actions;
create policy daily_quality_actions_member_write on public.daily_quality_actions for all to authenticated
using (public.daily_is_selen_staff() or exists(select 1 from public.organisation_memberships m where m.organisation_id=daily_quality_actions.organisation_id and m.user_id=(select auth.uid()) and m.status='active' and m.primary_role='manager'))
with check (public.daily_is_selen_staff() or exists(select 1 from public.organisation_memberships m where m.organisation_id=daily_quality_actions.organisation_id and m.user_id=(select auth.uid()) and m.status='active' and m.primary_role='manager'));
grant select,insert,update,delete on public.daily_quality_actions to authenticated;
grant all on public.daily_quality_actions to service_role;
