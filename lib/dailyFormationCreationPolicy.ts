export const DAILY_FORMATION_CREATION_MODES = ["program_import", "selen_form"] as const;

export type DailyFormationCreationMode = (typeof DAILY_FORMATION_CREATION_MODES)[number];

const SELEN_FORM_REQUIRED_FIELDS = [
  "title",
  "global_objective",
  "target_audience",
  "duration_hours",
  "duration_days",
  "modality",
  "access_delays",
  "price",
  "pedagogical_resources",
  "evaluation_methods",
  "contact_phone",
  "contact_email",
] as const;

const PROGRAM_IMPORT_REQUIRED_COMPLEMENTS = [
  "title",
  "duration_hours",
  "duration_days",
  "modality",
  "contact_phone",
  "contact_email",
] as const;

export function parseDailyFormationCreationMode(value: unknown): DailyFormationCreationMode {
  return value === "program_import" ? "program_import" : "selen_form";
}

export function requiredFormationFields(mode: DailyFormationCreationMode): readonly string[] {
  return mode === "program_import" ? PROGRAM_IMPORT_REQUIRED_COMPLEMENTS : SELEN_FORM_REQUIRED_FIELDS;
}

export function validateFormationCreationSource(
  mode: DailyFormationCreationMode,
  detailedProgramDocumentUrl: string | null | undefined,
): string | null {
  if (mode === "program_import" && !String(detailedProgramDocumentUrl ?? "").trim()) {
    return "Importez le programme original de la formation avant d’enregistrer ce parcours.";
  }
  return null;
}

export function requiresStructuredLearningObjectives(mode: DailyFormationCreationMode): boolean {
  return mode === "selen_form";
}
