-- A4 — keep immutable review lookups efficient without widening access.

create index if not exists daily_prerequisite_evidence_reviews_document_idx
  on public.daily_prerequisite_evidence_reviews(document_id);

create index if not exists daily_prerequisite_evidence_reviews_reviewer_idx
  on public.daily_prerequisite_evidence_reviews(reviewed_by);
