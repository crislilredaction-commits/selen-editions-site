-- Keep the human review bound to the declaration used by an open candidature.
-- No candidature, file or historical decision is rewritten by this guard.
create or replace function public.guard_daily_formation_prerequisite_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.prerequisite_mode is not distinct from old.prerequisite_mode
     and new.prerequisite_requirements is not distinct from old.prerequisite_requirements
     and (new.prerequisite_mode <> 'required' or new.prerequisites is not distinct from old.prerequisites) then
    return new;
  end if;

  -- Upgrade the formation row lock before checking open requests. Inserts with
  -- the canonical formation FK wait, then seed evidence from the new declaration.
  perform id from public.daily_formations where id = old.id for update;
  if exists (
    select 1 from public.daily_formation_registration_requests
     where formation_id = old.id
       and decision_status not in ('accepted', 'refused')
  ) then
    raise exception using
      errcode = 'PSE01',
      message = 'Les prérequis sont utilisés par des candidatures en cours. Conservez cette déclaration jusqu’à leur clôture ; les autres informations de la formation restent modifiables.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_daily_formation_prerequisite_edit() from public, anon, authenticated;

create trigger daily_formations_guard_prerequisite_edit
before update of prerequisite_mode, prerequisite_requirements, prerequisites on public.daily_formations
for each row execute function public.guard_daily_formation_prerequisite_edit();
