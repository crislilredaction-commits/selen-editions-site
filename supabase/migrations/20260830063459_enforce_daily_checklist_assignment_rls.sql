-- Daily : la visibilité Studio ne suffit pas. Les écritures réelles des checklists
-- doivent respecter l'agent assigné à l'organisme puis l'ouverture aux autres agents
-- après 72 h. Les droits client existants sur les tâches client/shared de session
-- restent inchangés et continuent de s'appliquer via leurs politiques séparées.

drop policy if exists daily_organisation_checklist_staff_all
on public.daily_organisation_checklist_items;

create policy daily_organisation_checklist_staff_assignment_scope
on public.daily_organisation_checklist_items
for all
to authenticated
using (
  public.daily_is_selen_staff()
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
    or exists (
      select 1
      from public.daily_organisation_assignments doa
      join public.agent_profiles ap
        on ap.id = doa.agent_profile_id
       and ap.is_active = true
      where doa.organisation_id = daily_organisation_checklist_items.organisation_id
        and (
          ap.user_id = (select auth.uid())
          or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
    )
    or (
      daily_organisation_checklist_items.signaled_at <= now() - interval '72 hours'
      and exists (
        select 1
        from public.agent_profiles ap
        where ap.is_active = true
          and (
            ap.user_id = (select auth.uid())
            or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
          )
      )
    )
  )
)
with check (
  public.daily_is_selen_staff()
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
    or exists (
      select 1
      from public.daily_organisation_assignments doa
      join public.agent_profiles ap
        on ap.id = doa.agent_profile_id
       and ap.is_active = true
      where doa.organisation_id = daily_organisation_checklist_items.organisation_id
        and (
          ap.user_id = (select auth.uid())
          or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
    )
    or (
      daily_organisation_checklist_items.signaled_at <= now() - interval '72 hours'
      and exists (
        select 1
        from public.agent_profiles ap
        where ap.is_active = true
          and (
            ap.user_id = (select auth.uid())
            or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
          )
      )
    )
  )
);

drop policy if exists "Selen staff manage Daily session checklist"
on public.daily_session_checklist_items;

create policy daily_session_checklist_staff_assignment_scope
on public.daily_session_checklist_items
for all
to authenticated
using (
  public.daily_is_selen_staff()
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
    or exists (
      select 1
      from public.daily_organisation_assignments doa
      join public.agent_profiles ap
        on ap.id = doa.agent_profile_id
       and ap.is_active = true
      where doa.organisation_id = daily_session_checklist_items.organisation_id
        and (
          ap.user_id = (select auth.uid())
          or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
    )
    or (
      daily_session_checklist_items.signaled_at <= now() - interval '72 hours'
      and exists (
        select 1
        from public.agent_profiles ap
        where ap.is_active = true
          and (
            ap.user_id = (select auth.uid())
            or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
          )
      )
    )
  )
)
with check (
  public.daily_is_selen_staff()
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
    or exists (
      select 1
      from public.daily_organisation_assignments doa
      join public.agent_profiles ap
        on ap.id = doa.agent_profile_id
       and ap.is_active = true
      where doa.organisation_id = daily_session_checklist_items.organisation_id
        and (
          ap.user_id = (select auth.uid())
          or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
    )
    or (
      daily_session_checklist_items.signaled_at <= now() - interval '72 hours'
      and exists (
        select 1
        from public.agent_profiles ap
        where ap.is_active = true
          and (
            ap.user_id = (select auth.uid())
            or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
          )
      )
    )
  )
);
