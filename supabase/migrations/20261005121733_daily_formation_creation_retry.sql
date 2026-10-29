-- Keep the initial received creation separate from later agent corrections.
-- The existing formation UUID/primary key is the transmission identity.
alter table public.daily_formations add column if not exists creation_submission_fingerprint text;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.daily_formations'::regclass and conname='daily_formations_creation_submission_fingerprint_check') then
    alter table public.daily_formations add constraint daily_formations_creation_submission_fingerprint_check
      check (creation_submission_fingerprint is null or creation_submission_fingerprint ~ '^[a-f0-9]{64}$');
  end if;
end $$;
comment on column public.daily_formations.creation_submission_fingerprint is 'Server-computed fingerprint of the initial received creation; later programme review preserves it for exact, scoped retries.';
