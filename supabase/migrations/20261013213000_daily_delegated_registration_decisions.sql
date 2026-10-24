-- Studio delegation: explicit agent identity, organisation scope, atomic decision and audit.
-- Service role only; the API must verify the live assistance token before invoking.
create or replace function public.daily_decide_registration_as_studio(
  p_request_id uuid, p_session_id uuid, p_assistance_id uuid,
  p_agent_user_id uuid, p_decision text, p_comment text default null
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_token public.selen_agent_assistance_tokens%rowtype;
  v_request public.daily_formation_registration_requests%rowtype;
  v_formation public.daily_formations%rowtype;
  v_session public.daily_sessions%rowtype;
  v_decision_id uuid;
  v_result jsonb;
begin
  select * into v_token from public.selen_agent_assistance_tokens
    where id=p_assistance_id and status='active' and expires_at>now() for update;
  if not found or v_token.agent_user_id is distinct from p_agent_user_id
    or coalesce(v_token.metadata->>'scope','daily_workspace') <> 'daily_workspace'
  then raise exception 'studio assistance authorization required'; end if;
  if not exists(select 1 from public.agent_profiles where user_id=p_agent_user_id and is_active=true)
    and not exists(select 1 from public.selen_admin_users where lower(email)=lower(v_token.agent_email) and is_active=true)
  then raise exception 'studio agent is inactive'; end if;
  if p_decision not in ('accepted','refused') then raise exception 'invalid decision'; end if;
  select * into v_request from public.daily_formation_registration_requests where id=p_request_id for update;
  if not found or v_request.decision_status <> 'ready_for_of'
    or v_request.agent_analysis_completed_at is null or v_request.prerequisites_validated is not true
    or v_request.materialized_at is not null
  then raise exception 'request not eligible for decision'; end if;
  select * into v_formation from public.daily_formations where id=v_request.formation_id;
  if not found or v_formation.organisation_id is distinct from v_token.organisation_id
  then raise exception 'request outside delegated organisation'; end if;
  if p_decision='accepted' then
    select * into v_session from public.daily_sessions where id=p_session_id;
    if not found or v_session.organisation_id is distinct from v_token.organisation_id
      or v_session.formation_id is distinct from v_request.formation_id
      or v_session.status in ('archived','cancelled') or v_session.status is null
    then raise exception 'session outside delegated formation'; end if;
  end if;
  insert into public.daily_registration_request_decisions
    (registration_request_id,organisation_id,actor_type,actor_user_id,trainer_profile_id,decision,comment)
    values(p_request_id,v_token.organisation_id,'organisation',p_agent_user_id,null,p_decision,
      nullif(btrim(coalesce(p_comment,'')),''))
    returning id into v_decision_id;
  update public.daily_formation_registration_requests
    set decision_status=p_decision,
      accepted_at=case when p_decision='accepted' then now() else null end,
      accepted_decision_id=case when p_decision='accepted' then v_decision_id else null end,
      refused_at=case when p_decision='refused' then now() else null end,
      updated_at=now()
    where id=p_request_id;
  if p_decision='accepted' then
    v_result:=public.daily_materialize_registration_request(p_request_id,p_session_id);
  end if;
  insert into public.selen_agent_assistance_logs
    (assistance_token_id,agent_user_id,agent_email,organisation_id,dossier_id,action,action_label,metadata)
    values(p_assistance_id,p_agent_user_id,v_token.agent_email,v_token.organisation_id,v_token.dossier_id,
      'daily_registration_decision','Décision candidature en délégation Studio',
      jsonb_build_object('request_id',p_request_id,'session_id',p_session_id,'decision',p_decision,
        'decision_id',v_decision_id,'mode','agent_assistance'));
  return jsonb_build_object('request_id',p_request_id,'decision_id',v_decision_id,'decision',p_decision,'materialization',v_result);
end; $$;
revoke all on function public.daily_decide_registration_as_studio(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.daily_decide_registration_as_studio(uuid,uuid,uuid,uuid,text,text) to service_role;
