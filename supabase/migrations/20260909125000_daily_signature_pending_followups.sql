alter table public.client_reminders
  drop constraint if exists client_reminders_type_check;

alter table public.client_reminders
  add constraint client_reminders_type_check
  check (reminder_type = any (array[
    'preaudit_incomplete_15_days'::text,
    'audit_blanc_booking_reminder_7_days'::text,
    'audit_blanc_48h_reminder'::text,
    'nda_inactive_9_days'::text,
    'qualiopi_surveillance_window_open'::text,
    'qualiopi_renewal_4_months'::text,
    'qualiopi_certificate_expiry'::text,
    'daily_signature_pending_72h'::text
  ]));

alter table public.client_reminders
  drop constraint if exists client_reminders_status_check;

alter table public.client_reminders
  add constraint client_reminders_status_check
  check (status = any (array[
    'draft'::text,
    'ready'::text,
    'sent'::text,
    'ignored'::text,
    'postponed'::text,
    'resolved'::text
  ]));
