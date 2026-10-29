// Only rows explicitly derived at read time are excluded. Legacy learner IDs are retained.
export const ENROLMENT_PARTICIPANT_SOURCE = "daily_session_enrolments";

export function isStoredSessionParticipant(value: unknown): boolean {
  return !value || typeof value !== "object"
    || (value as Record<string, unknown>).participant_source !== ENROLMENT_PARTICIPANT_SOURCE;
}

export function storedSessionParticipants<T>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).filter(isStoredSessionParticipant);
}
