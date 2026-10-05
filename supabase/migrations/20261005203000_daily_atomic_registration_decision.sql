-- A5 — one acceptance creates one coherent pretraining continuation.
-- The wrapper is deliberately replayable: a concurrent retry either performs the
-- first atomic decision/materialization or reuses the accepted dossier safely.
create or replace function public.daily_accept_and_materialize_registration_request(
  p_request_id uuid,
  p_session_id uuid,
  p_actor_user_id uuid,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_request public.daily_formation_registration_requests%rowtype;
  v_decision jsonb;
  v_materialization jsonb;
  v_replayed boolean := false;
begin
  if p_session_id is null then
    raise exception 'session required';
  end if;

  select * into v_request
  from public.daily_formation_registration_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'registration request not found';
  end if;

  if v_request.decision_status = 'refused' then
    raise exception 'registration request already decided';
  elsif v_request.decision_status = 'accepted' then
    if v_request.attached_session_id is not null and v_request.attached_session_id <> p_session_id then
      raise exception 'accepted registration request session cannot change';
    end if;
    v_replayed := true;
    v_decision := jsonb_build_object(
      'request_id', p_request_id,
      'decision', 'accepted',
      'decision_status', 'accepted',
      'actor_type', 'organisation'
    );
  else
    v_decision := public.daily_record_registration_request_decision(
      p_request_id,
      p_actor_user_id,
      'organisation',
      'accepted',
      p_comment
    );
  end if;

  -- Any error here rolls back the decision above. The existing materializer locks
  -- the dossier and its unique mappings prevent duplicate learners/enrolments.
  v_materialization := public.daily_materialize_registration_request(p_request_id, p_session_id);

  return jsonb_build_object(
    'request_id', p_request_id,
    'decision', v_decision,
    'materialization', v_materialization,
    'replayed', v_replayed
  );
end;
$$;

revoke all on function public.daily_accept_and_materialize_registration_request(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.daily_accept_and_materialize_registration_request(uuid, uuid, uuid, text) to service_role;

create or replace function public.daily_close_registration_request_tasks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.decision_status in ('accepted', 'refused')
     and old.decision_status is distinct from new.decision_status then
    update public.notifications
       set dismissed_at = coalesce(dismissed_at, now()),
           read_at = coalesce(read_at, now())
     where source_kind = 'daily_registration_request'
       and source_key = 'daily-registration-request:' || new.id::text
       and dismissed_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.daily_close_registration_request_tasks() from public, anon, authenticated;
grant execute on function public.daily_close_registration_request_tasks() to service_role;

drop trigger if exists daily_registration_request_close_tasks on public.daily_formation_registration_requests;
create trigger daily_registration_request_close_tasks
after update of decision_status on public.daily_formation_registration_requests
for each row
when (new.decision_status in ('accepted', 'refused') and old.decision_status is distinct from new.decision_status)
execute function public.daily_close_registration_request_tasks();

comment on function public.daily_accept_and_materialize_registration_request(uuid, uuid, uuid, text) is
  'A5: atomically accepts one candidature and materializes its unique session enrolments; safe to replay for the same session.';
comment on function public.daily_close_registration_request_tasks() is
  'A5: closes active Studio notifications when a candidature receives its final OF decision.';
