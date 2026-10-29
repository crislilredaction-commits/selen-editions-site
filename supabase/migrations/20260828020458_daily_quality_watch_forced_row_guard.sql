drop policy if exists daily_org_watch_client_update on public.daily_organisation_watch_entries;
create policy daily_org_watch_client_update on public.daily_organisation_watch_entries for update to authenticated
using (
  forced_by_studio = false
  and exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = daily_organisation_watch_entries.organisation_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  )
)
with check (
  forced_by_studio = false
  and forced_by_agent_profile_id is null
  and forced_at is null
  and exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = daily_organisation_watch_entries.organisation_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  )
);
