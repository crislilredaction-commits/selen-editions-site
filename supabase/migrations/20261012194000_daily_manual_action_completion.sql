create table if not exists public.daily_action_dismissals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  action_id text not null,
  action_title text,
  reason text,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organisation_id, action_id)
);

alter table public.daily_action_dismissals enable row level security;

create index if not exists daily_action_dismissals_organisation_idx
  on public.daily_action_dismissals (organisation_id, completed_at desc);
