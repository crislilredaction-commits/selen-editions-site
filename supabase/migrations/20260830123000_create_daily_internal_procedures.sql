create table if not exists public.daily_internal_procedures (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  procedure_type text not null check (procedure_type in ('learner_administration','stakeholder_satisfaction','absence_dropout')),
  title text not null,
  purpose text,
  steps text not null default '',
  responsibilities text,
  evidence text,
  status text not null default 'draft' check (status in ('draft','active')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, procedure_type)
);

create index if not exists daily_internal_procedures_organisation_idx
  on public.daily_internal_procedures (organisation_id, procedure_type);

alter table public.daily_internal_procedures enable row level security;
revoke all on table public.daily_internal_procedures from anon, authenticated;
grant select, insert, update on table public.daily_internal_procedures to service_role;

comment on table public.daily_internal_procedures is
  'Procédures propres à l’organisme Daily : parcours administratif apprenant, satisfaction des parties prenantes, absences et abandons.';
