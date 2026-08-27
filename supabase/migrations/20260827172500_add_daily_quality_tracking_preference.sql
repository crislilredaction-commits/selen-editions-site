alter table public.daily_onboarding
  add column if not exists quality_tracking_enabled boolean not null default true;

update public.daily_onboarding
set quality_tracking_enabled = true
where qualiopi_status = 'yes';
