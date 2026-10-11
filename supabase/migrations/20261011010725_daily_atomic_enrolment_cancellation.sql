-- P0 — atomic, replay-safe cancellation of one enrolment before training.
-- One PostgreSQL function owns the status transition, resolved history and both
-- access revocations so a request can never leave a partially cancelled dossier.
create or replace function public.daily_cancel_enrolment(
  p_organisation_id uuid,
  p_enrolment_id uuid,
  p_reason text,
  p_occurred_at timestamptz,
  p_actor_user_id uuid default null,
  p_author_name text default 'Organisme de formation'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_enrolment record;
  v_now timestamptz := now();
  v_already_cancelled boolean := false;
  v_portal_revoked integer := 0;
  v_attendance_revoked integer := 0;
begin
  if p_organisation_id is null
     or p_enrolment_id is null
     or nullif(btrim(coalesce(p_reason, '')), '') is null
     or p_occurred_at is null then
    raise exception using errcode = '22023',
      message = 'daily_cancel_invalid_input';
  end if;

  select
    enrolment.id,
    enrolment.learner_id,
    enrolment.session_id,
    enrolment.status,
    session.start_date
  into v_enrolment
  from public.daily_session_enrolments enrolment
  join public.daily_sessions session
    on session.id = enrolment.session_id
   and session.organisation_id = enrolment.organisation_id
  where enrolment.id = p_enrolment_id
    and enrolment.organisation_id = p_organisation_id
  for update of enrolment;

  if not found then
    raise exception using errcode = 'P0002',
      message = 'daily_cancel_enrolment_not_found';
  end if;

  if v_enrolment.status = 'cancelled' then
    v_already_cancelled := true;
  else
    if v_enrolment.status in ('declined', 'abandoned', 'completed') then
      raise exception using errcode = '23514',
        message = 'daily_cancel_enrolment_already_closed';
    end if;
    if v_enrolment.start_date is not null and current_date >= v_enrolment.start_date then
      raise exception using errcode = '23514',
        message = 'daily_cancel_session_started';
    end if;

    update public.daily_session_enrolments
       set status = 'cancelled',
           updated_at = v_now
     where id = v_enrolment.id
       and organisation_id = p_organisation_id;

    insert into public.daily_session_followup_entries (
      organisation_id,
      session_id,
      enrolment_id,
      entry_type,
      level,
      occurred_at,
      summary,
      description,
      action_taken,
      status,
      created_by,
      resolved_by,
      resolved_at,
      author_role,
      author_name
    ) values (
      p_organisation_id,
      v_enrolment.session_id,
      v_enrolment.id,
      'incident',
      'info',
      p_occurred_at,
      'Désinscription avant formation',
      btrim(p_reason),
      'Inscription annulée avant formation. Les accès apprenant et émargement ont été révoqués ; les preuves antérieures sont conservées.',
      'resolved',
      p_actor_user_id,
      p_actor_user_id,
      v_now,
      'Organisme de formation',
      coalesce(nullif(btrim(p_author_name), ''), 'Organisme de formation')
    );
  end if;

  update public.daily_portal_access_tokens
     set status = 'revoked',
         updated_at = v_now
   where session_id = v_enrolment.session_id
     and portal_type = 'learner'
     and entity_key = 'learner:' || v_enrolment.learner_id::text
     and status <> 'revoked';
  get diagnostics v_portal_revoked = row_count;

  update public.daily_attendance_access_tokens
     set status = 'revoked'
   where organisation_id = p_organisation_id
     and session_id = v_enrolment.session_id
     and enrolment_id = v_enrolment.id
     and status = 'active';
  get diagnostics v_attendance_revoked = row_count;

  return jsonb_build_object(
    'enrolmentId', v_enrolment.id,
    'learnerId', v_enrolment.learner_id,
    'sessionId', v_enrolment.session_id,
    'status', 'cancelled',
    'alreadyCancelled', v_already_cancelled,
    'portalAccessRevoked', v_portal_revoked,
    'attendanceAccessRevoked', v_attendance_revoked
  );
end;
$$;

revoke all on function public.daily_cancel_enrolment(uuid, uuid, text, timestamptz, uuid, text)
  from public, anon, authenticated;
grant execute on function public.daily_cancel_enrolment(uuid, uuid, text, timestamptz, uuid, text)
  to service_role;

comment on function public.daily_cancel_enrolment(uuid, uuid, text, timestamptz, uuid, text) is
  'Atomically cancels one pre-training enrolment, records resolved history, revokes learner access, and is replay-safe under row locking.';
