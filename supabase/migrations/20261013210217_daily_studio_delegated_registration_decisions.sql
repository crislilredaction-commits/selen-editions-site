begin;

-- Preserve the real Studio actor, independently of the represented OF account.
alter table public.daily_registration_request_decisions
  add column if not exists delegation_context jsonb;
alter table public.daily_registration_request_decisions
  drop constraint daily_registration_request_decisions_actor_type_check,
  drop constraint daily_registration_request_decisions_trainer_actor_check;
alter table public.daily_registration_request_decisions
  add constraint daily_registration_request_decisions_actor_type_check
    check (actor_type in ('organisation','trainer','studio_agent')),
  add constraint daily_registration_request_decisions_trainer_actor_check
    check ((actor_type='trainer' and trainer_profile_id is not null)
      or (actor_type in ('organisation','studio_agent') and trainer_profile_id is null)),
  add constraint daily_registration_request_decisions_delegation_check
    check (actor_type <> 'studio_agent' or (
      delegation_context is not null
      and jsonb_typeof(delegation_context)='object'
      and (delegation_context->>'agent_user_id') is not distinct from actor_user_id::text
      and (delegation_context->>'organisation_id') is not distinct from organisation_id::text
      and delegation_context ? 'assistance_id'));

-- Service-only: the API proves possession of the bearer token, then SQL checks
-- the live delegation and actor again. No manager identity is substituted.
create or replace function public.daily_decide_delegated_registration_request(
  p_request_id uuid, p_assistance_id uuid, p_token_hash text, p_action text,
  p_session_id uuid default null, p_comment text default null,
  p_confirmed boolean default false, p_historical_reason text default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_token public.selen_agent_assistance_tokens%rowtype;
  v_agent public.agent_profiles%rowtype;
  v_admin public.selen_admin_users%rowtype;
  v_request public.daily_formation_registration_requests%rowtype;
  v_source public.daily_formations%rowtype;
  v_target public.daily_formations%rowtype;
  v_session public.daily_sessions%rowtype;
  v_reconciliation public.daily_registration_request_reconciliations%rowtype;
  v_decision_id uuid; v_audit_id uuid; v_session_id uuid;
  v_actor_context jsonb; v_old_state jsonb; v_new_state jsonb;
  v_actor_email text; v_actor_label text; v_decision text;
  v_result jsonb; v_replayed boolean := false;
begin
  if p_confirmed is not true then raise exception 'explicit delegated confirmation required' using errcode='22023'; end if;
  if p_action is null or p_action not in ('accepted','refused','materialize','accept_historical','retry_access') then
    raise exception 'invalid delegated action' using errcode='22023';
  end if;
  select * into v_token from public.selen_agent_assistance_tokens
    where id=p_assistance_id and token_hash=p_token_hash and status='active'
      and expires_at > clock_timestamp() for share;
  if not found or v_token.agent_user_id is null
    or coalesce(v_token.metadata->>'scope','daily_workspace') <> 'daily_workspace' then
    raise exception 'delegation invalid or expired' using errcode='42501';
  end if;
  select * into v_agent from public.agent_profiles
    where is_active and (user_id=v_token.agent_user_id
      or (user_id is null and lower(btrim(email))=lower(btrim(v_token.agent_email))))
    order by (user_id=v_token.agent_user_id) desc nulls last limit 1 for share;
  select * into v_admin from public.selen_admin_users
    where is_active and user_id=v_token.agent_user_id limit 1 for share;
  if v_agent.id is null and v_admin.id is null then
    raise exception 'active Studio actor required' using errcode='42501';
  end if;
  select * into v_request from public.daily_formation_registration_requests where id=p_request_id for update;
  if not found then raise exception 'registration request not found' using errcode='P0002'; end if;
  select * into v_source from public.daily_formations where id=v_request.formation_id;
  if v_source.id is null or v_source.organisation_id is distinct from v_token.organisation_id then
    raise exception 'registration request outside delegation' using errcode='42501';
  end if;
  -- Recheck after waiting for the candidature lock.
  if v_token.expires_at <= clock_timestamp() then raise exception 'delegation expired' using errcode='42501'; end if;
  if v_request.status='archived' then raise exception 'registration request archived'; end if;
  v_old_state := jsonb_build_object('decision_status',v_request.decision_status,'formation_id',v_request.formation_id,
    'session_id',v_request.attached_session_id,'materialized_at',v_request.materialized_at);
  v_decision := case when p_action='refused' then 'refused' else 'accepted' end;
  if v_request.decision_status='refused' or (v_request.decision_status='accepted' and v_decision='refused') then
    raise exception 'registration request already decided';
  end if;
  if v_request.agent_analysis_completed_at is null then raise exception 'agent analysis required'; end if;
  if v_request.prerequisites_validated is not true then raise exception 'prerequisites must be validated'; end if;
  if v_request.decision_status='accepted' then
    v_replayed := true;
    v_decision_id := v_request.accepted_decision_id;
    if v_request.materialized_at is not null and p_session_id is not null
      and p_session_id is distinct from v_request.attached_session_id then raise exception 'accepted session cannot be changed'; end if;
    if p_action='accept_historical' then
      select * into v_reconciliation from public.daily_registration_request_reconciliations where registration_request_id=p_request_id;
      if v_reconciliation.id is null or v_reconciliation.target_session_id is distinct from p_session_id then
        raise exception 'historical reconciliation replay mismatch';
      end if;
    end if;
  elsif v_request.decision_status <> 'ready_for_of' then raise exception 'agent analysis required';
  elsif p_action in ('materialize','retry_access') then raise exception 'registration request must be accepted first';
  end if;
  v_session_id := coalesce(p_session_id,v_request.attached_session_id);
  if v_decision='accepted' then
    select * into v_session from public.daily_sessions where id=v_session_id;
    if v_session.id is null or v_session.organisation_id is distinct from v_token.organisation_id then
      raise exception 'session outside delegation' using errcode='42501';
    end if;
    if coalesce(lower(v_session.status),'') in ('','archived','cancelled','canceled','deleted','removed','abandoned') then
      raise exception 'session unavailable';
    end if;
    if p_action='accept_historical' and not v_replayed then
      if length(btrim(coalesce(p_historical_reason,''))) < 12 then raise exception 'historical confirmation and reason required' using errcode='22023'; end if;
      select * into v_target from public.daily_formations where id=v_session.formation_id;
      if v_target.id is null or v_target.organisation_id is distinct from v_source.organisation_id
        or v_source.previous_version_id is distinct from v_target.id or v_target.status <> 'archived'
        or lower(btrim(v_source.title)) <> lower(btrim(v_target.title))
        or v_source.duration_hours is distinct from v_target.duration_hours
        or v_source.duration_days is distinct from v_target.duration_days
        or v_source.global_objective is distinct from v_target.global_objective
        or v_source.prerequisite_mode is distinct from v_target.prerequisite_mode
        or v_source.prerequisite_requirements is distinct from v_target.prerequisite_requirements then
        raise exception 'historical session is not a verified predecessor';
      end if;
      if exists(select 1 from public.daily_registration_request_enrolments where registration_request_id=p_request_id)
        or exists(select 1 from public.daily_prerequisite_evidence where registration_request_id=p_request_id)
        or exists(select 1 from public.daily_documents where linked_object_type='registration_request' and linked_object_id=p_request_id) then
        raise exception 'existing evidence or enrolments require manual reconciliation';
      end if;
      if v_request.prerequisite_contract->>'mode' is distinct from v_target.prerequisite_mode
        or coalesce(v_request.prerequisite_contract->'requirements','[]'::jsonb) is distinct from coalesce(v_target.prerequisite_requirements,'[]'::jsonb) then
        raise exception 'prerequisite contract differs';
      end if;
      insert into public.daily_registration_request_reconciliations
        (registration_request_id,source_formation_id,target_formation_id,target_session_id,actor_user_id,reason)
        values(p_request_id,v_source.id,v_target.id,v_session.id,v_token.agent_user_id,left(btrim(p_historical_reason),1800));
      update public.daily_formation_registration_requests set formation_id=v_target.id,attached_session_id=v_session.id where id=p_request_id;
    elsif v_session.formation_id is distinct from v_request.formation_id then
      raise exception 'session does not match registration request';
    end if;
  end if;
  v_actor_email := coalesce(v_agent.email,v_admin.email,v_token.agent_email);
  v_actor_label := coalesce(nullif(btrim(concat_ws(' ',v_agent.first_name,v_agent.last_name)),''),v_actor_email,'Agent Studio');
  v_actor_context := jsonb_build_object('assistance_id',v_token.id,'agent_user_id',v_token.agent_user_id,
    'agent_profile_id',v_agent.id,'agent_email',v_actor_email,'actor_label',v_actor_label,
    'organisation_id',v_token.organisation_id,'scope','daily_workspace','confirmed_at',clock_timestamp());
  if not v_replayed then
    insert into public.daily_registration_request_decisions
      (registration_request_id,organisation_id,actor_type,actor_user_id,trainer_profile_id,decision,comment,delegation_context)
      values(p_request_id,v_token.organisation_id,'studio_agent',v_token.agent_user_id,null,v_decision,
        nullif(btrim(coalesce(p_comment,'')),''),v_actor_context) returning id into v_decision_id;
    update public.daily_formation_registration_requests set decision_status=v_decision,
      accepted_at=case when v_decision='accepted' then now() else null end,
      accepted_decision_id=case when v_decision='accepted' then v_decision_id else null end,
      refused_at=case when v_decision='refused' then now() else null end,updated_at=now() where id=p_request_id;
  end if;
  if v_decision='accepted' then
    v_result := public.daily_materialize_registration_request(p_request_id,v_session_id);
  end if;
  select * into v_request from public.daily_formation_registration_requests where id=p_request_id;
  v_new_state := jsonb_build_object('decision_status',v_request.decision_status,'formation_id',v_request.formation_id,
    'session_id',v_request.attached_session_id,'materialized_at',v_request.materialized_at);
  -- An audit failure rolls back the decision, reconciliation and inscriptions.
  insert into public.selen_agent_assistance_logs
    (assistance_token_id,agent_user_id,agent_email,organisation_id,dossier_id,action,action_label,old_state,new_state,metadata)
    values(v_token.id,v_token.agent_user_id,v_actor_email,v_token.organisation_id,v_token.dossier_id,
      'registration_request_'||p_action,'Candidature : '||p_action||' en délégation Studio',v_old_state,v_new_state,
      v_actor_context||jsonb_build_object('mode','agent_assistance','registration_request_id',p_request_id,
        'decision_id',v_decision_id,'replayed',v_replayed,'historical_reason',p_historical_reason)) returning id into v_audit_id;
  return jsonb_build_object('request_id',p_request_id,'decision_id',v_decision_id,'decision',v_decision,
    'actor_type','studio_agent','actor_user_id',v_token.agent_user_id,'audit_id',v_audit_id,
    'session_id',v_request.attached_session_id,'replayed',v_replayed,'materialization',v_result,
    'reconciled',p_action='accept_historical');
end;
$$;
revoke all on function public.daily_decide_delegated_registration_request(uuid,uuid,text,text,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.daily_decide_delegated_registration_request(uuid,uuid,text,text,uuid,text,boolean,text) to service_role;

commit;
