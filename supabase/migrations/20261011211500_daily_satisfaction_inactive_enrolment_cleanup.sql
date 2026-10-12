-- PA1 — retire satisfaction follow-ups as soon as their enrolment is inactive.
-- The response and communication history remain untouched.
create or replace function private.daily_close_obsolete_satisfaction_followups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organisation_id uuid := coalesce(new.organisation_id, old.organisation_id);
  v_session_id uuid := coalesce(new.session_id, old.session_id);
  v_enrolment_id uuid := coalesce(new.id, old.id);
  v_inactive boolean := tg_op = 'DELETE'
    or new.status in ('cancelled', 'declined', 'abandoned');
begin
  if v_inactive and (tg_op = 'DELETE' or new.status is distinct from old.status) then
    update public.daily_quality_actions
       set status = 'closed',
           implemented_at = coalesce(implemented_at, now()),
           implemented_improvement = coalesce(
             implemented_improvement,
             'Inscription inactive : relance satisfaction devenue sans objet.'
           ),
           updated_at = now()
     where organisation_id = v_organisation_id
       and session_id = v_session_id
       and source_type = 'satisfaction_phone_followup'
       and source_id = v_enrolment_id
       and status in ('open', 'planned');

    update public.daily_learner_feedback_tokens
       set status = 'revoked'
     where organisation_id = v_organisation_id
       and session_id = v_session_id
       and enrolment_id = v_enrolment_id
       and status = 'active';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.daily_close_obsolete_satisfaction_followups()
  from public, anon, authenticated;

drop trigger if exists daily_enrolment_satisfaction_lifecycle
  on public.daily_session_enrolments;
create trigger daily_enrolment_satisfaction_lifecycle
after update of status or delete on public.daily_session_enrolments
for each row
execute function private.daily_close_obsolete_satisfaction_followups();

-- Reconcile the finite pre-existing gap without deleting history.
update public.daily_quality_actions action
   set status = 'closed',
       implemented_at = coalesce(action.implemented_at, now()),
       implemented_improvement = coalesce(
         action.implemented_improvement,
         'Inscription inactive : relance satisfaction devenue sans objet.'
       ),
       updated_at = now()
 where action.source_type = 'satisfaction_phone_followup'
   and action.status in ('open', 'planned')
   and not exists (
     select 1
       from public.daily_session_enrolments enrolment
      where enrolment.id = action.source_id
        and enrolment.organisation_id = action.organisation_id
        and enrolment.session_id = action.session_id
        and enrolment.status not in ('cancelled', 'declined', 'abandoned')
   );

update public.daily_learner_feedback_tokens token
   set status = 'revoked'
  from public.daily_session_enrolments enrolment
 where token.organisation_id = enrolment.organisation_id
   and token.session_id = enrolment.session_id
   and token.enrolment_id = enrolment.id
   and token.status = 'active'
   and enrolment.status in ('cancelled', 'declined', 'abandoned');

comment on function private.daily_close_obsolete_satisfaction_followups() is
  'Closes active learner satisfaction follow-ups and revokes active feedback tokens when the enrolment becomes inactive.';
