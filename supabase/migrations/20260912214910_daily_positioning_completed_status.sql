-- F2 closure — allow the canonical positioning trigger to persist the terminal status.
-- The existing sync_daily_positioning_status() trigger writes `completed` after a
-- positioning response is submitted. The historical CHECK constraint did not include
-- this terminal value, so a valid submission could fail at the database boundary.
-- No Auth, RLS, grant, secret or infrastructure change.

alter table public.daily_session_enrolments
  drop constraint if exists daily_session_enrolments_positioning_status_check;

alter table public.daily_session_enrolments
  add constraint daily_session_enrolments_positioning_status_check
  check (
    positioning_status = any (
      array[
        'not_started'::text,
        'sent'::text,
        'submitted'::text,
        'reviewed'::text,
        'completed'::text
      ]
    )
  );
