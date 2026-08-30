create or replace function private.daily_normalize_qualiopi_reminder_due_at()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_due_date date;
begin
  if new.prestation_type <> 'daily_qualiopi' then
    return new;
  end if;

  case new.reminder_type
    when 'qualiopi_surveillance_window_open' then
      v_due_date := nullif(new.metadata ->> 'window_start', '')::date;
    when 'qualiopi_renewal_4_months' then
      v_due_date := (nullif(new.metadata ->> 'valid_until', '')::date - interval '4 months')::date;
    when 'qualiopi_certificate_expiry' then
      v_due_date := nullif(new.metadata ->> 'valid_until', '')::date;
    else
      return new;
  end case;

  if v_due_date is not null then
    new.due_at := (v_due_date::timestamp + time '07:00') at time zone 'Europe/Paris';
  end if;

  return new;
end;
$$;

revoke all on function private.daily_normalize_qualiopi_reminder_due_at() from public, anon, authenticated;

drop trigger if exists client_reminders_normalize_daily_qualiopi_due_at on public.client_reminders;
create trigger client_reminders_normalize_daily_qualiopi_due_at
before insert or update of due_at, metadata, reminder_type, prestation_type
on public.client_reminders
for each row
execute function private.daily_normalize_qualiopi_reminder_due_at();

update public.client_reminders
set due_at = due_at
where prestation_type = 'daily_qualiopi'
  and reminder_type in (
    'qualiopi_surveillance_window_open',
    'qualiopi_renewal_4_months',
    'qualiopi_certificate_expiry'
  )
  and status in ('draft', 'ready', 'postponed');
