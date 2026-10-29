alter table public.daily_session_followup_entries
  add column if not exists author_role text,
  add column if not exists author_name text;

comment on column public.daily_session_followup_entries.author_role is
  'Role metier de l auteur de la contribution de suivi (organisme, formateur, apprenant, entreprise, Selen, etc.).';
comment on column public.daily_session_followup_entries.author_name is
  'Nom affichable de l auteur au moment de la contribution, conserve pour la chronologie et les exports.';
