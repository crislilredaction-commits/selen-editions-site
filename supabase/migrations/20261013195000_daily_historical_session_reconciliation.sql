-- Historical session reconciliation: service-role only, atomic and audited.
create table if not exists public.daily_registration_request_reconciliations (
  id uuid primary key default gen_random_uuid(),
  registration_request_id uuid not null references public.daily_formation_registration_requests(id),
  source_formation_id uuid not null references public.daily_formations(id),
  target_formation_id uuid not null references public.daily_formations(id),
  target_session_id uuid not null references public.daily_sessions(id),
  actor_user_id uuid not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (registration_request_id)
);
revoke all on public.daily_registration_request_reconciliations from public, anon, authenticated;
grant select, insert on public.daily_registration_request_reconciliations to service_role;
alter table public.daily_registration_request_reconciliations enable row level security;

create or replace function public.daily_accept_historical_registration_request(
  p_request_id uuid, p_session_id uuid, p_actor_user_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_request public.daily_formation_registration_requests%rowtype;
  v_source public.daily_formations%rowtype;
  v_target public.daily_formations%rowtype;
  v_session public.daily_sessions%rowtype;
  v_result jsonb;
begin
  if p_actor_user_id is null or length(btrim(coalesce(p_reason,''))) < 12 then
    raise exception 'confirmation and reason required';
  end if;
  select * into v_request from public.daily_formation_registration_requests where id=p_request_id for update;
  if not found or v_request.decision_status <> 'ready_for_of' or v_request.materialized_at is not null then
    raise exception 'request is not eligible for historical reconciliation';
  end if;
  select * into v_source from public.daily_formations where id=v_request.formation_id;
  select * into v_session from public.daily_sessions where id=p_session_id;
  select * into v_target from public.daily_formations where id=v_session.formation_id;
  if v_source.id is null or v_target.id is null or v_session.id is null
    or v_source.organisation_id is distinct from v_target.organisation_id
    or v_session.organisation_id is distinct from v_source.organisation_id
    or v_source.previous_version_id is distinct from v_target.id
    or v_target.status <> 'archived'
    or v_session.status in ('archived','cancelled')
    or v_session.status is null
    or lower(btrim(v_source.title)) <> lower(btrim(v_target.title))
    or v_source.duration_hours is distinct from v_target.duration_hours
    or v_source.duration_days is distinct from v_target.duration_days
    or v_source.global_objective is distinct from v_target.global_objective
    or v_source.prerequisite_mode is distinct from v_target.prerequisite_mode
    or v_source.prerequisite_requirements is distinct from v_target.prerequisite_requirements
  then raise exception 'historical session is not a verified predecessor'; end if;
  if exists (select 1 from public.daily_registration_request_enrolments where registration_request_id=p_request_id)
    or exists (select 1 from public.daily_prerequisite_evidence where registration_request_id=p_request_id)
    or exists (select 1 from public.daily_documents where linked_object_type='registration_request' and linked_object_id=p_request_id)
  then raise exception 'existing evidence or enrolments require manual reconciliation'; end if;
  if v_request.prerequisite_contract->>'mode' is distinct from v_target.prerequisite_mode
    or coalesce(v_request.prerequisite_contract->'requirements','[]'::jsonb) is distinct from coalesce(v_target.prerequisite_requirements,'[]'::jsonb)
  then raise exception 'prerequisite contract differs'; end if;
  insert into public.daily_registration_request_reconciliations
    (registration_request_id,source_formation_id,target_formation_id,target_session_id,actor_user_id,reason)
  values (p_request_id,v_source.id,v_target.id,p_session_id,p_actor_user_id,btrim(p_reason));
  update public.daily_formation_registration_requests
    set formation_id=v_target.id, attached_session_id=p_session_id, updated_at=now()
    where id=p_request_id;
  v_result := public.daily_accept_and_materialize_registration_request(p_request_id,p_session_id,p_actor_user_id,
    'Régularisation de session historique : '||left(btrim(p_reason),1800));
  return jsonb_build_object('reconciled',true,'source_formation_id',v_source.id,'target_formation_id',v_target.id,'result',v_result);
end;
$$;
revoke all on function public.daily_accept_historical_registration_request(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.daily_accept_historical_registration_request(uuid,uuid,uuid,text) to service_role;
