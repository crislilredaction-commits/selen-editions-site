alter table public.daily_formation_registration_requests
  add column if not exists agent_analysis_summary jsonb,
  add column if not exists agent_analysis_completed_at timestamptz,
  add column if not exists agent_analysis_completed_by uuid,
  add column if not exists prerequisites_validated boolean,
  add column if not exists refused_at timestamptz;

alter table public.daily_formation_registration_requests drop constraint if exists daily_formation_registration_requests_decision_status_check;
alter table public.daily_formation_registration_requests add constraint daily_formation_registration_requests_decision_status_check
check (decision_status = any (array['pending'::text,'ready_for_of'::text,'accepted'::text,'refused'::text]));

create or replace function public.daily_record_registration_request_decision(
  p_request_id uuid, p_actor_user_id uuid, p_actor_type text, p_decision text, p_comment text default null
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_request public.daily_formation_registration_requests%rowtype; v_formation public.daily_formations%rowtype; v_org_id uuid; v_decision_id uuid; v_is_manager boolean := false;
begin
  if p_actor_type <> 'organisation' then raise exception 'manager permission required'; end if;
  if p_decision not in ('accepted','refused') then raise exception 'invalid decision'; end if;
  select * into v_request from public.daily_formation_registration_requests where id=p_request_id for update;
  if not found then raise exception 'registration request not found'; end if;
  select * into v_formation from public.daily_formations where id=v_request.formation_id;
  if not found then raise exception 'formation not found'; end if;
  v_org_id := v_formation.organisation_id;
  if v_request.decision_status in ('accepted','refused') then raise exception 'registration request already decided'; end if;
  if v_request.decision_status <> 'ready_for_of' or v_request.agent_analysis_completed_at is null then raise exception 'agent analysis required'; end if;
  if v_request.prerequisites_validated is not true then raise exception 'prerequisites must be validated'; end if;
  select exists(select 1 from public.organisation_memberships m join public.organisation_membership_roles r on r.membership_id=m.id and r.role='manager' where m.organisation_id=v_org_id and m.user_id=p_actor_user_id and m.status='active') into v_is_manager;
  if not v_is_manager then raise exception 'manager permission required'; end if;
  insert into public.daily_registration_request_decisions(registration_request_id,organisation_id,actor_type,actor_user_id,trainer_profile_id,decision,comment)
  values(p_request_id,v_org_id,'organisation',p_actor_user_id,null,p_decision,nullif(btrim(coalesce(p_comment,'')),'')) returning id into v_decision_id;
  update public.daily_formation_registration_requests set decision_status=p_decision,
    accepted_at=case when p_decision='accepted' then now() else null end,
    accepted_decision_id=case when p_decision='accepted' then v_decision_id else null end,
    refused_at=case when p_decision='refused' then now() else null end, updated_at=now() where id=p_request_id;
  return jsonb_build_object('request_id',p_request_id,'decision_id',v_decision_id,'decision',p_decision,'decision_status',p_decision,'actor_type','organisation');
end; $$;
revoke all on function public.daily_record_registration_request_decision(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.daily_record_registration_request_decision(uuid,uuid,text,text,text) to service_role;
