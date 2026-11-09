-- Prepare initial attendance in the same transaction as a ready session or
-- enrolment. No cron or manual "prepare" click is required. Existing slots
-- (including deliberately cancelled ones), modes and signatures remain intact.
create schema if not exists private;
create or replace function private.daily_prepare_initial_attendance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.daily_sessions%rowtype;
  v_session_id uuid;
begin
  if tg_table_name = 'daily_sessions' then
    v_session_id := new.id;
  else
    v_session_id := new.session_id;
  end if;

  -- Serialize preparation and late enrolments on their parent session.
  select * into v_session from public.daily_sessions
    where id = v_session_id and organisation_id = new.organisation_id
    for update;
  if not found or v_session.status <> 'ready' then return new; end if;

  if not exists (select 1 from public.daily_attendance_slots
    where session_id = v_session.id and organisation_id = v_session.organisation_id) then
    insert into public.daily_attendance_slots
      (organisation_id, session_id, slot_key, slot_date, starts_at, ends_at, mode, label, status)
    select v_session.organisation_id, v_session.id,
      concat(b.value->>'date', '-', b.value->>'start', '-', b.value->>'end', '-', b.ordinality),
      (b.value->>'date')::date, (b.value->>'start')::time, (b.value->>'end')::time,
      case when v_session.modality = 'distanciel' then
        case when v_session.distance_mode = 'asynchrone' then 'distanciel_asynchrone'
          else 'distanciel_synchrone' end
        else 'presentiel' end,
      nullif(btrim(b.value->>'note'), ''), 'draft'
    from jsonb_array_elements(v_session.schedule_blocks) with ordinality as b(value, ordinality)
    on conflict (session_id, slot_key) do nothing;
  end if;

  insert into public.daily_attendance_records
    (organisation_id, session_id, slot_id, enrolment_id, status)
  select v_session.organisation_id, v_session.id, a.id, e.id, 'pending'
  from public.daily_attendance_slots a
  join public.daily_session_enrolments e
    on e.session_id = a.session_id and e.organisation_id = a.organisation_id
  where a.session_id = v_session.id and a.organisation_id = v_session.organisation_id
    and a.status in ('draft', 'open')
    and coalesce(e.status, '') not in ('declined', 'cancelled', 'abandoned', 'completed')
  on conflict (slot_id, enrolment_id) do nothing;
  return new;
end;
$$;
revoke all on function private.daily_prepare_initial_attendance() from public, anon, authenticated;

-- Late naming lets existing dossier/checklist creation run first.
create trigger zz_daily_sessions_prepare_initial_attendance
  after insert or update of status, schedule_blocks on public.daily_sessions
  for each row execute function private.daily_prepare_initial_attendance();
create trigger zz_daily_enrolments_prepare_initial_attendance
  after insert or update of status, session_id on public.daily_session_enrolments
  for each row execute function private.daily_prepare_initial_attendance();
