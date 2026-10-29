-- A completed Selen analysis must expose the dossier to the organisation for decision.
-- This does NOT accept an inscription or bypass the existing decision RPC guards.
create or replace function public.daily_promote_analyzed_registration_request()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.decision_status = 'pending'
     and new.agent_analysis_completed_at is not null
     and new.submitted_at is not null
     and new.status is distinct from 'archived' then
    new.decision_status := 'ready_for_of';
  end if;
  return new;
end;
$$;

revoke all on function public.daily_promote_analyzed_registration_request() from public, anon, authenticated;
grant execute on function public.daily_promote_analyzed_registration_request() to service_role;

drop trigger if exists daily_promote_analyzed_registration_request
  on public.daily_formation_registration_requests;
create trigger daily_promote_analyzed_registration_request
before insert or update of agent_analysis_completed_at, decision_status
on public.daily_formation_registration_requests
for each row execute function public.daily_promote_analyzed_registration_request();

-- Repair previously analyzed submissions which were stranded in pending.
update public.daily_formation_registration_requests
   set decision_status = 'ready_for_of'
 where decision_status = 'pending'
   and agent_analysis_completed_at is not null
   and submitted_at is not null
   and status is distinct from 'archived';
