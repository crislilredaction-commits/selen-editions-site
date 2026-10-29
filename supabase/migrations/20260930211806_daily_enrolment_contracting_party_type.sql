-- NULL preserves the historical reading rule; no inferred backfill or default.
ALTER TABLE public.daily_session_enrolments
  ADD COLUMN contracting_party_type text
  CONSTRAINT daily_session_enrolments_contracting_party_type_check
  CHECK (contracting_party_type IN ('individual', 'company'));

ALTER TABLE public.daily_session_enrolments
  ADD CONSTRAINT daily_session_enrolments_company_party_required_check
  CHECK (contracting_party_type IS DISTINCT FROM 'company'
    OR NULLIF(btrim(company_name), '') IS NOT NULL);

COMMENT ON COLUMN public.daily_session_enrolments.contracting_party_type IS
  'Contracting party for this enrolment only. NULL is historical/unspecified; independent of funding and learner SIRET.';
