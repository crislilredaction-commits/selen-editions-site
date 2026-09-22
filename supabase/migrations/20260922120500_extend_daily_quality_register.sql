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

insert into public.daily_quality_actions (
  organisation_id, session_id, category, source_type, source_id, title, observation,
  status, event_date, event_source, created_at, updated_at
)
select
  f.organisation_id, f.session_id, 'complaint', 'stakeholder_feedback', f.id,
  coalesce(nullif(f.subject,''), 'Réclamation partie prenante'), f.message,
  case when f.status in ('resolved','closed') then 'closed' else 'open' end,
  f.created_at::date,
  coalesce(nullif(f.submitter_name,''), nullif(f.stakeholder_type,''), 'Partie prenante'),
  f.created_at, coalesce(f.updated_at,f.created_at)
from public.daily_stakeholder_feedback f
where f.submission_type = 'complaint'
  and not exists (
    select 1 from public.daily_quality_actions q
    where q.source_type = 'stakeholder_feedback' and q.source_id = f.id
  );

comment on column public.daily_quality_actions.event_date is 'Date métier de l’événement qualité.';
comment on column public.daily_quality_actions.event_source is 'Source ou origine de l’événement qualité.';
comment on column public.daily_quality_actions.responsible_name is 'Responsable chargé du suivi de l’événement.';
comment on column public.daily_quality_actions.corrective_action is 'Action corrective décidée pour l’événement.';
comment on column public.daily_quality_actions.corrective_action_date is 'Date prévue ou réalisée de l’action corrective.';
