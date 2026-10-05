export const PREREQUISITE_EVIDENCE_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const APPLICATION_PRIVATE_DOCUMENTS_MAX_BYTES = 4 * 1024 * 1024;

export const PREREQUISITE_EVIDENCE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export const PREREQUISITE_EVIDENCE_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

export type PrerequisiteRequirement = {
  id: string;
  label: string;
  description?: string;
  required?: boolean;
};

export type PrerequisiteSubject = {
  first_name: string;
  last_name: string;
  email: string;
};

export function prerequisiteEvidenceKey(participantIndex: number, requirementId: string) {
  return `${participantIndex}:${requirementId}`;
}

