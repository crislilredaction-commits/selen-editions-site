create or replace function public.daily_notify_registration_request_agent_review()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_formation_title text;
  v_organisation_id uuid;
  v_organisation_name text;
  v_agent_profile_id uuid;
begin
  if new.decision_status <> 'agent_review' or old.decision_status = 'agent_review' then
    return new;
  end if;

  select f.organisation_id, f.title, coalesce(o.legal_name, o.name)
    into v_organisation_id, v_formation_title, v_organisation_name
  from public.daily_formations f
  join public.organisations o on o.id = f.organisation_id
  where f.id = new.formation_id;

  if v_organisation_id is null then
    return new;
  end if;

  select a.agent_profile_id into v_agent_profile_id
  from public.daily_organisation_assignments a
  where a.organisation_id = v_organisation_id;

  insert into public.notifications(
    type,
    title,
    content,
    dossier_id,
    dossier_title,
    organisation_name,
    link_path,
    target_role,
    target_agent_profile_id,
    source_key,
    source_kind
  ) values (
    'daily_registration_review',
    'Candidature à revoir',
    'Un refus a été enregistré avant tout accord OF ou formateur. La candidature doit être revue par Selen avant décision.',
    null,
    coalesce(v_formation_title, 'Candidature Daily'),
    v_organisation_name,
    '/agent/daily/organisations/' || v_organisation_id::text,
    'agent',
    v_agent_profile_id,
    'daily-registration-request:' || new.id::text,
    'daily_registration_request'
  );

  return new;
end;
$$;

revoke all on function public.daily_notify_registration_request_agent_review() from public, anon, authenticated;
grant execute on function public.daily_notify_registration_request_agent_review() to service_role;

drop trigger if exists daily_registration_request_agent_review_notification on public.daily_formation_registration_requests;
create trigger daily_registration_request_agent_review_notification
after update of decision_status on public.daily_formation_registration_requests
for each row
when (new.decision_status = 'agent_review' and old.decision_status is distinct from new.decision_status)
execute function public.daily_notify_registration_request_agent_review();

comment on function public.daily_notify_registration_request_agent_review() is 'Crée une notification Studio quand un refus de candidature Daily arrive avant tout accord OF/formateur.';