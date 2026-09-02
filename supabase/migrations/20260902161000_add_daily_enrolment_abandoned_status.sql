alter table public.daily_session_enrolments
  drop constraint daily_session_enrolments_status_check;

alter table public.daily_session_enrolments
  add constraint daily_session_enrolments_status_check
  check (
    status = any (
      array[
        'invited'::text,
        'pending'::text,
        'confirmed'::text,
        'declined'::text,
        'cancelled'::text,
        'abandoned'::text,
        'completed'::text
      ]
    )
  ) not valid;

alter table public.daily_session_enrolments
  validate constraint daily_session_enrolments_status_check;
