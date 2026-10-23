-- A rejected late-attendance proof starts a new, versioned correction cycle.
-- Keep each cycle idempotent without colliding with the original attendance reminder.
create unique index if not exists daily_attendance_correction_request_active_unique
  on public.daily_communications (
    organisation_id,
    session_id,
    enrolment_id,
    communication_type,
    (metadata ->> 'attendance_slot_id'),
    (metadata ->> 'review_version')
  )
  where communication_type = 'attendance_correction_request'
    and status in ('queued', 'sent', 'delivered')
    and metadata ? 'attendance_slot_id'
    and metadata ? 'review_version';

comment on index public.daily_attendance_correction_request_active_unique is
  'Prevents duplicate active correction requests for one rejected attendance review version while preserving every attempt.';
