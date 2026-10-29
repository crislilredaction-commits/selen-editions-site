-- P0-D — prerequisite evidence attached to a public registration request.
-- Submission is deliberately distinct from human verification.

create table if not exists public.daily_prerequisite_evidence (
  id uuid primary key default gen_random_uuid(),
  registration_request_id uuid not null references public.daily_formation_registration_requests(id) on delete cascade,
  participant_index integer not null default 0 check (participant_index >= 0),
  requirement_id text not null check (length(btrim(requirement_id)) > 0),
  requirement_label text not null check (length(btrim(requirement_label)) > 0),
  document_id uuid references public.daily_documents(id) on delete set null,
  status text not null default 'awaiting_upload' check (status = any (array['awaiting_upload'::text, 'submitted'::text, 'verified'::text, 'rejected'::text])),
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_prerequisite_evidence_unique_requirement unique (registration_request_id, participant_index, requirement_id),
  constraint daily_prerequisite_evidence_submission_consistency check (
    (status = 'awaiting_upload' and document_id is null and submitted_at is null)
    or
    (status in ('submitted', 'verified', 'rejected') and document_id is not null and submitted_at is not null)
  ),
  constraint daily_prerequisite_evidence_review_consistency check (
    (status in ('awaiting_upload', 'submitted') and reviewed_by is null and reviewed_at is null)
    or
    (status in ('verified', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

comment on table public.daily_prerequisite_evidence is
  'P0-D evidence requested for mandatory formation prerequisites. Upload/submission never implies human verification.';
comment on column public.daily_prerequisite_evidence.status is
  'awaiting_upload -> submitted -> verified/rejected. Only verified satisfies a mandatory prerequisite.';

create index if not exists daily_prerequisite_evidence_request_idx
  on public.daily_prerequisite_evidence(registration_request_id, participant_index, status);

alter table public.daily_prerequisite_evidence enable row level security;

-- No browser policy on purpose: candidature/evidence access remains server-mediated.
-- Service-role routes enforce registration token or authenticated organisation context.
revoke all on table public.daily_prerequisite_evidence from anon, authenticated;
grant all on table public.daily_prerequisite_evidence to service_role;
