create unique index if not exists daily_attendance_communications_active_unique
  on public.daily_communications (
    organisation_id,
    session_id,
    enrolment_id,
    communication_type,
    ((metadata ->> 'attendance_slot_id'))
  )
  where communication_type in ('attendance_request', 'attendance_reminder')
    and status in ('queued', 'sent', 'delivered')
    and metadata ? 'attendance_slot_id';
