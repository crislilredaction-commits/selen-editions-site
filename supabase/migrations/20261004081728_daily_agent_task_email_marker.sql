-- Present in the shared Studio database, but missing from this repository's
-- migration history. No data backfill: a null timestamp is not delivery proof.
alter table public.notifications
  add column if not exists email_sent_at timestamptz;
