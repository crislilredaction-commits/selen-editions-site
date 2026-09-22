alter table public.daily_quality_actions
  add column if not exists event_date date,
  add column if not exists event_source text,
  add column if not exists responsible_name text,
  add column if not exists corrective_action text,
  add column if not exists corrective_action_date date;

update public.daily_quality_actions
set event_date = created_at::date
where event_date is null
  and category in ('incident','difficulty','complaint');

comment on column public.daily_quality_actions.event_date is 'Date métier de l’événement qualité.';
comment on column public.daily_quality_actions.event_source is 'Source ou origine de l’événement qualité.';
comment on column public.daily_quality_actions.responsible_name is 'Responsable chargé du suivi de l’événement.';
comment on column public.daily_quality_actions.corrective_action is 'Action corrective décidée pour l’événement.';
comment on column public.daily_quality_actions.corrective_action_date is 'Date prévue ou réalisée de l’action corrective.';
