export const DAILY_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const DAILY_FORMATION_SOURCE_KINDS = ["training_program_source", "positioning_questionnaire_source", "learning_assessment_source"] as const;
export type DailyFormationSourceKind = typeof DAILY_FORMATION_SOURCE_KINDS[number];
export type DailySourceUploadState = "idle" | "pending" | "failed";

// Word files can have an empty or generic browser MIME type. An explicit
// incompatible MIME type or an unsupported extension must still be rejected.
export function dailyFormationSourceMime(name: string, mime: string) {
  const extensions: Record<string, string> = {
    pdf: "application/pdf", doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  const extension = name.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
  const expected = extension ? extensions[extension] : undefined;
  if (!expected) return null;
  if (!mime || ["application/octet-stream", "binary/octet-stream"].includes(mime.toLowerCase())) return expected;
  return mime.toLowerCase() === expected ? expected : null;
}

export function prepareDailyFormationSourceUpload(file: Blob, mime: string) {
  // The Storage SDK uses the multipart Blob's type rather than contentType.
  return { body: file.slice(0, file.size, mime), options: { contentType: mime, cacheControl: "0", upsert: false } };
}
