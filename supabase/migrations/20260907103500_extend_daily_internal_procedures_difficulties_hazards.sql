alter table public.daily_internal_procedures
  drop constraint if exists daily_internal_procedures_procedure_type_check;

alter table public.daily_internal_procedures
  add constraint daily_internal_procedures_procedure_type_check
  check (procedure_type in (
    'learner_administration',
    'stakeholder_satisfaction',
    'absence_dropout',
    'difficulties_hazards'
  ));

comment on table public.daily_internal_procedures is
  'Procédures propres à l’organisme Daily : parcours administratif apprenant, satisfaction des parties prenantes, absences et abandons, prévention des difficultés et aléas.';
