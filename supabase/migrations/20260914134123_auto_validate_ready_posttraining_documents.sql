create or replace function public.daily_auto_validate_posttraining_document()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session_id uuid;
  v_session_end date;
  v_active_enrolments integer := 0;
  v_active_slots integer := 0;
  v_expected_records integer := 0;
  v_settled_records integer := 0;
begin
  if new.status is distinct from 'to_check' then
    return new;
  end if;

  if new.document_type not in ('attendance_summary', 'completion_certificate') then
    return new;
  end if;

  if coalesce(new.metadata->>'generated_by', '') <> 'daily_posttraining' then
    return new;
  end if;

  if new.document_type = 'attendance_summary' then
    if new.linked_object_type is distinct from 'session' then
      return new;
    end if;
    v_session_id := new.linked_object_id;
  else
    if new.linked_object_type is distinct from 'enrolment' then
      return new;
    end if;
    select e.session_id
      into v_session_id
      from public.daily_session_enrolments e
     where e.id = new.linked_object_id
       and e.status not in ('declined', 'cancelled', 'abandoned');
    if v_session_id is null then
      return new;
    end if;
  end if;

  select s.end_date
    into v_session_end
    from public.daily_sessions s
   where s.id = v_session_id
     and s.organisation_id = new.organisation_id;

  if v_session_end is null or v_session_end > current_date then
    return new;
  end if;

  select count(*) into v_active_enrolments
    from public.daily_session_enrolments e
   where e.session_id = v_session_id
     and e.status not in ('declined', 'cancelled', 'abandoned');

  select count(*) into v_active_slots
    from public.daily_attendance_slots s
   where s.session_id = v_session_id
     and s.status <> 'cancelled';

  if v_active_enrolments = 0 or v_active_slots = 0 then
    return new;
  end if;

  v_expected_records := v_active_enrolments * v_active_slots;

  select count(*) into v_settled_records
    from public.daily_attendance_records r
    join public.daily_session_enrolments e on e.id = r.enrolment_id
    join public.daily_attendance_slots s on s.id = r.slot_id
   where r.session_id = v_session_id
     and e.session_id = v_session_id
     and e.status not in ('declined', 'cancelled', 'abandoned')
     and s.session_id = v_session_id
     and s.status <> 'cancelled'
     and r.status <> 'pending';

  if v_settled_records <> v_expected_records then
    return new;
  end if;

  if exists (
    select 1
      from public.daily_attendance_slots s
     where s.session_id = v_session_id
       and s.status <> 'cancelled'
       and s.status <> 'closed'
  ) then
    return new;
  end if;

  if new.document_type = 'completion_certificate' then
    if not exists (
      select 1
        from public.daily_attendance_records r
        join public.daily_attendance_slots s on s.id = r.slot_id
       where r.session_id = v_session_id
         and r.enrolment_id = new.linked_object_id
         and s.session_id = v_session_id
         and s.status <> 'cancelled'
         and r.status = 'present'
    ) then
      return new;
    end if;

    if not exists (
      select 1
        from public.daily_learning_assessments a
       where a.session_id = v_session_id
         and a.enrolment_id = new.linked_object_id
         and a.outcome is not null
         and a.outcome <> 'pending'
    ) then
      return new;
    end if;
  end if;

  new.status := 'validated';
  return new;
end;
$$;

drop trigger if exists daily_documents_auto_validate_posttraining on public.daily_documents;
create trigger daily_documents_auto_validate_posttraining
before insert or update of status, metadata, document_type, linked_object_type, linked_object_id
on public.daily_documents
for each row
execute function public.daily_auto_validate_posttraining_document();

revoke all on function public.daily_auto_validate_posttraining_document() from public, anon, authenticated;
