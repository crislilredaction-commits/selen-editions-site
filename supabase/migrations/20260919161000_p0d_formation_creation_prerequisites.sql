-- P0-D — persist the canonical formation creation path and prerequisite declaration.
-- Non-destructive: existing formations remain Selen-form formations with no declared mandatory prerequisites.

alter table public.daily_formations
  add column if not exists creation_mode text not null default 'selen_form',
  add column if not exists prerequisite_mode text not null default 'none',
  add column if not exists prerequisite_requirements jsonb not null default '[]'::jsonb;

alter table public.daily_formations
  drop constraint if exists daily_formations_creation_mode_check,
  add constraint daily_formations_creation_mode_check
    check (creation_mode = any (array['program_import'::text, 'selen_form'::text])),
  drop constraint if exists daily_formations_prerequisite_mode_check,
  add constraint daily_formations_prerequisite_mode_check
    check (prerequisite_mode = any (array['none'::text, 'required'::text])),
  drop constraint if exists daily_formations_prerequisite_requirements_array_check,
  add constraint daily_formations_prerequisite_requirements_array_check
    check (jsonb_typeof(prerequisite_requirements) = 'array'::text),
  drop constraint if exists daily_formations_prerequisite_requirements_consistency_check,
  add constraint daily_formations_prerequisite_requirements_consistency_check
    check (
      (prerequisite_mode = 'none'::text and jsonb_array_length(prerequisite_requirements) = 0)
      or
      (prerequisite_mode = 'required'::text and jsonb_array_length(prerequisite_requirements) > 0)
    );

comment on column public.daily_formations.creation_mode is
  'P0-D canonical creation path: program_import keeps the OF original as reference; selen_form uses structured Selen entry.';
comment on column public.daily_formations.prerequisite_mode is
  'P0-D explicit prerequisite declaration: none or required.';
comment on column public.daily_formations.prerequisite_requirements is
  'P0-D JSON array of mandatory prerequisite evidence requirements defined by the training organisation. Evidence submission and human validation are tracked separately per enrolment.';
