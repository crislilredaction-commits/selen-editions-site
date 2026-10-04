/** Shared limits for the filled documents sent with one candidature. */
export const OWN_POSITIONING_MAX_BYTES = 3 * 1024 * 1024;
export const OWN_POSITIONING_ACCEPT = ".pdf,.doc,.docx";
export const OWN_POSITIONING_MIME_TYPES = [
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type OwnPositioningSource = { id: string; name: string };
export type PositioningSubject = { first_name: string; last_name: string; email: string };
export function positioningSubjectKey(subject: PositioningSubject) {
  return [subject.first_name, subject.last_name, subject.email].map(value => value.trim().toLowerCase()).join("\u0000");
}

export function positioningSourceDocumentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Only the existing private, organisation-scoped upload route is accepted.
  const match = value.match(/^\/api\/client\/daily\/uploads\?id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return match?.[1].toLowerCase() ?? null;
}
