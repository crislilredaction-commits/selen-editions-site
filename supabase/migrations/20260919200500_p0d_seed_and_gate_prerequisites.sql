-- P0-D — propagate mandatory prerequisite requirements into candidature evidence
-- and prevent final acceptance until every required proof has been human-verified.

create or replace function public.seed_daily_prerequisite_evidence()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  formation_row record;
  requirement jsonb;
  participant_count integer;
  participant_index integer;
begin
  select prerequisite_mode, prerequisite_requirements
    into formation_row
    from public.daily_formations
   where id = new.formation_id;

  if formation_row.prerequisite_mode is distinct from 'required' then
    return new;
  end if;

  participant_count := case
    when new.response_type = 'company' then greatest(jsonb_array_length(coalesce(new.participants, '[]'::jsonb)), 1)
    else 1
  end;

  for participant_index in 0..participant_count - 1 loop
    for requirement in
      select value
        from jsonb_array_elements(coalesce(formation_row.prerequisite_requirements, '[]'::jsonb))
    loop
      insert into public.daily_prerequisite_evidence (
        registration_request_id,
        participant_index,
        requirement_id,
        requirement_label,
        status
      ) values (
        new.id,
        participant_index,
        coalesce(nullif(btrim(requirement->>'id'), ''), 'prerequisite_' || participant_index::text),
        btrim(requirement->>'label'),
        'awaiting_upload'
      )
      on conflict (registration_request_id, participant_index, requirement_id) do nothing;
    end loop;
  end loop;

  return new;
end;
$$;

revoke all on function public.seed_daily_prerequisite_evidence() from public, anon, authenticated;

drop trigger if exists daily_registration_seed_prerequisite_evidence on public.daily_formation_registration_requests;
create trigger daily_registration_seed_prerequisite_evidence
after insert on public.daily_formation_registration_requests
for each row execute function public.seed_daily_prerequisite_evidence();

create or replace function public.guard_daily_registration_prerequisite_acceptance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  formation_row record;
  participant_count integer;
  expected_count integer;
  verified_count integer;
begin
  if new.decision_status <> 'accepted' or old.decision_status = 'accepted' then
    return new;
  end if;

  select prerequisite_mode, prerequisite_requirements
    into formation_row
    from public.daily_formations
   where id = new.formation_id;

  if formation_row.prerequisite_mode is distinct from 'required' then
    return new;
  end if;

  participant_count := case
    when new.response_type = 'company' then greatest(jsonb_array_length(coalesce(new.participants, '[]'::jsonb)), 1)
    else 1
  end;
  expected_count := participant_count * jsonb_array_length(coalesce(formation_row.prerequisite_requirements, '[]'::jsonb));

  select count(*)::integer
    into verified_count
    from public.daily_prerequisite_evidence
   where registration_request_id = new.id
     and status = 'verified';

  if expected_count = 0 or verified_count < expected_count then
    raise exception using
      errcode = '23514',
      message = 'Impossible d’accepter la candidature : tous les justificatifs de prérequis obligatoires doivent être vérifiés humainement.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_daily_registration_prerequisite_acceptance() from public, anon, authenticated;

drop trigger if exists daily_registration_guard_prerequisite_acceptance on public.daily_formation_registration_requests;
create trigger daily_registration_guard_prerequisite_acceptance
before update of decision_status on public.daily_formation_registration_requests
for each row execute function public.guard_daily_registration_prerequisite_acceptance();
