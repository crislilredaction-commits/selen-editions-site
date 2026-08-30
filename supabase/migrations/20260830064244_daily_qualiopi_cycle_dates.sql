alter table public.organisations
  add column if not exists qualiopi_surveillance_audit_date date null,
  add column if not exists qualiopi_surveillance_window_start date generated always as (
    case when qualiopi_valid_from is null then null else (qualiopi_valid_from + interval '16 months')::date end
  ) stored,
  add column if not exists qualiopi_surveillance_window_end date generated always as (
    case when qualiopi_valid_from is null then null else (qualiopi_valid_from + interval '20 months')::date end
  ) stored,
  add column if not exists qualiopi_renewal_reminder_on date generated always as (
    case when qualiopi_valid_until is null then null else (qualiopi_valid_until - interval '4 months')::date end
  ) stored;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organisations_qualiopi_surveillance_after_cycle_start_chk'
      and conrelid = 'public.organisations'::regclass
  ) then
    alter table public.organisations
      add constraint organisations_qualiopi_surveillance_after_cycle_start_chk
      check (
        qualiopi_surveillance_audit_date is null
        or qualiopi_valid_from is null
        or qualiopi_surveillance_audit_date >= qualiopi_valid_from
      );
  end if;
end
$$;
