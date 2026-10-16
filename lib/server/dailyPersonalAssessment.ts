const FINAL_ASSESSMENT_OUTCOMES = new Set([
  "achieved",
  "partially_achieved",
  "not_achieved",
  "not_applicable",
]);

const text = (value: unknown) => String(value ?? "").trim();

export function isFinalAssessmentResult(outcome: unknown, assessedAt: unknown) {
  return FINAL_ASSESSMENT_OUTCOMES.has(text(outcome)) && Boolean(text(assessedAt));
}

export function personalAssessmentResultDocumentId(enrolmentId: unknown) {
  const id = text(enrolmentId);
  return id ? `portal:personal-assessment-result:${id}` : "";
}

export function personalAssessmentResultEnrolmentId(documentId: unknown) {
  const match = /^portal:personal-assessment-result:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(text(documentId));
  return match?.[1] ?? null;
}

export function assessmentOutcomeLabel(outcome: unknown) {
  if (outcome === "achieved") return "Acquis";
  if (outcome === "partially_achieved") return "Partiellement acquis";
  if (outcome === "not_achieved") return "Non acquis";
  if (outcome === "not_applicable") return "Non applicable";
  return "En attente";
}
