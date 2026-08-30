-- Daily : une tâche appartient d'abord à l'agent assigné à l'organisme.
-- Après 72 h, une checklist non traitée devient visible/actionnable par les autres agents actifs
-- sans modifier l'assignation canonique de l'organisme.
-- Les checklists de session étaient auparavant visibles trop largement car leur source_kind
-- n'était pas classé parmi les notifications à accès restreint.

drop policy if exists notifications_studio_select on public.notifications;
drop policy if exists notifications_studio_update on public.notifications;

create policy notifications_studio_select
on public.notifications
for select
to authenticated
using (
  public.daily_is_selen_staff()
  and (
    source_kind is null
    or source_kind <> all (array[
      'daily_checklist'::text,
      'daily_session_checklist'::text,
      'daily_trainer_certification'::text
    ])
    or target_user_id = (select auth.uid())
    or target_agent_profile_id in (
      select ap.id
      from public.agent_profiles ap
      where ap.is_active = true
        and (
          ap.user_id = (select auth.uid())
          or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
    )
    or (
      target_role = 'admin'
      and target_agent_profile_id is null
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
    )
    or (
      source_kind in ('daily_checklist', 'daily_session_checklist')
      and escalation_at <= now()
      and (
        exists (
          select 1
          from public.agent_profiles ap
          where ap.is_active = true
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
    )
  )
);

create policy notifications_studio_update
on public.notifications
for update
to authenticated
using (
  public.daily_is_selen_staff()
  and (
    source_kind is null
    or source_kind <> all (array[
      'daily_checklist'::text,
      'daily_session_checklist'::text,
      'daily_trainer_certification'::text
    ])
    or target_user_id = (select auth.uid())
    or target_agent_profile_id in (
      select ap.id
      from public.agent_profiles ap
      where ap.is_active = true
        and (
          ap.user_id = (select auth.uid())
          or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
    )
    or (
      target_role = 'admin'
      and target_agent_profile_id is null
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
    )
    or (
      source_kind in ('daily_checklist', 'daily_session_checklist')
      and escalation_at <= now()
      and (
        exists (
          select 1
          from public.agent_profiles ap
          where ap.is_active = true
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
    )
  )
)
with check (public.daily_is_selen_staff());
