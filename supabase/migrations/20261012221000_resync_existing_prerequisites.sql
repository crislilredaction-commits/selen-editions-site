-- Re-evaluate already materialized enrolments when evidence is reviewed.
-- Reuse the guarded sync function from 20261012213000: only an accepted
-- dossier with complete mandatory coverage may transition not_reviewed -> met.
create or replace function public.daily_resync_prerequisites_after_review()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.registration_request_id is not null
     and new.status = 'verified'
     and old.status is distinct from new.status then
    update public.daily_registration_request_enrolments mapping
       set enrolment_id = mapping.enrolment_id
     where mapping.registration_request_id = new.registration_request_id;
  end if;
  return new;
end;
$$;

revoke all on function public.daily_resync_prerequisites_after_review()
  from public, anon, authenticated;
grant execute on function public.daily_resync_prerequisites_after_review()
  to service_role;

drop trigger if exists daily_resync_prerequisites_on_review
  on public.daily_prerequisite_evidence;
create trigger daily_resync_prerequisites_on_review
after update of status on public.daily_prerequisite_evidence
for each row execute function public.daily_resync_prerequisites_after_review();

-- Backfill only mappings still marked not_reviewed.
-- Every row is independently checked by daily_sync_materialized_prerequisite_status.
update public.daily_registration_request_enrolments mapping
   set enrolment_id = mapping.enrolment_id
  from public.daily_session_enrolments enrolment,
       public.daily_formation_registration_requests request
 where mapping.enrolment_id = enrolment.id
   and request.id = mapping.registration_request_id
   and request.decision_status = 'accepted'
   and enrolment.prerequisites_status = 'not_reviewed';
