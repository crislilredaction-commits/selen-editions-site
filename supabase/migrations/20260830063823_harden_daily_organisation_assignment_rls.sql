-- Défense en profondeur : l'API Studio reste la voie normale d'assignation.
-- Si des grants authenticated sont ajoutés un jour, la RLS conserve la règle métier :
-- admin = assignation/réassignation libre vers un agent éligible ; agent = auto-assignation
-- uniquement d'un organisme encore non assigné ; pas de réassignation non-admin.

drop policy if exists daily_organisation_assignments_staff_all
on public.daily_organisation_assignments;

create policy daily_organisation_assignments_staff_select
on public.daily_organisation_assignments
for select
to authenticated
using (public.daily_is_selen_staff());

create policy daily_organisation_assignments_staff_insert
on public.daily_organisation_assignments
for insert
to authenticated
with check (
  public.daily_is_selen_staff()
  and exists (
    select 1
    from public.agent_profiles target
    where target.id = daily_organisation_assignments.agent_profile_id
      and target.is_active = true
      and target.role in ('agent', 'admin')
  )
  and (
    daily_organisation_assignments.assigned_by is null
    or daily_organisation_assignments.assigned_by = (select auth.uid())
  )
  and (
    exists (
      select 1
      from public.agent_profiles ap
      where ap.is_active = true
        and ap.role = 'admin'
        and (
          ap.user_id = (select auth.uid())
          or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
    )
    or exists (
      select 1
      from public.selen_admin_users sau
      where sau.is_active = true
        and sau.role = 'admin'
        and (
          sau.user_id = (select auth.uid())
          or lower(sau.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
    )
    or (
      not exists (
        select 1
        from public.daily_organisation_assignments existing
        where existing.organisation_id = daily_organisation_assignments.organisation_id
      )
      and exists (
        select 1
        from public.agent_profiles own
        where own.id = daily_organisation_assignments.agent_profile_id
          and own.is_active = true
          and own.role = 'agent'
          and (
            own.user_id = (select auth.uid())
            or lower(own.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
          )
      )
    )
  )
);

create policy daily_organisation_assignments_admin_update
on public.daily_organisation_assignments
for update
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role = 'admin'
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
  )
  or exists (
    select 1
    from public.selen_admin_users sau
    where sau.is_active = true
      and sau.role = 'admin'
      and (
        sau.user_id = (select auth.uid())
        or lower(sau.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
  )
)
with check (
  exists (
    select 1
    from public.agent_profiles target
    where target.id = daily_organisation_assignments.agent_profile_id
      and target.is_active = true
      and target.role in ('agent', 'admin')
  )
  and (
    exists (
      select 1
      from public.agent_profiles ap
      where ap.is_active = true
        and ap.role = 'admin'
        and (
          ap.user_id = (select auth.uid())
          or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
    )
    or exists (
      select 1
      from public.selen_admin_users sau
      where sau.is_active = true
        and sau.role = 'admin'
        and (
          sau.user_id = (select auth.uid())
          or lower(sau.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
    )
  )
);

create policy daily_organisation_assignments_admin_delete
on public.daily_organisation_assignments
for delete
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role = 'admin'
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
  )
  or exists (
    select 1
    from public.selen_admin_users sau
    where sau.is_active = true
      and sau.role = 'admin'
      and (
        sau.user_id = (select auth.uid())
        or lower(sau.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
  )
);
