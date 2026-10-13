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
  if new.registration_request_id is not null
     and new.status = 'rejected'
     and old.status = 'verified'
     and not exists (
       select 1 from public.daily_prerequisite_evidence replacement
       where replacement.registration_request_id = new.registration_request_id
         and replacement.registration_response_id is null
         and replacement.participant_key = new.participant_key
         and replacement.requirement_id = new.requirement_id
         and replacement.requirement_label = new.requirement_label
         and replacement.document_id is not null
         and replacement.status = 'verified'
     ) then
    update public.daily_session_enrolments enrolment
       set prerequisites_status = 'not_reviewed'
      from public.daily_auto_prerequisite_reviews provenance
     where provenance.enrolment_id = enrolment.id
       and provenance.registration_request_id = new.registration_request_id
       and enrolment.prerequisites_status = 'met';
    delete from public.daily_auto_prerequisite_reviews provenance
     where provenance.registration_request_id = new.registration_request_id
       and exists (select 1 from public.daily_session_enrolments enrolment
                   where enrolment.id = provenance.enrolment_id
                     and enrolment.prerequisites_status = 'not_reviewed');
  end if;
  return new;
end;
$;

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
