export const CLIENT_VISIBLE_COMMUNICATION_STATUSES = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
] as const;

const POSTTRAINING_DOCUMENT_TYPES = new Set(["attendance_summary", "completion_certificate"]);
const PUBLISHED_DOCUMENT_STATUSES = new Set(["published", "signed"]);

export function isClientVisibleSessionDocument(document: { document_type?: unknown; status?: unknown }) {
  const documentType = String(document.document_type ?? "");
  if (!POSTTRAINING_DOCUMENT_TYPES.has(documentType)) return true;
  return PUBLISHED_DOCUMENT_STATUSES.has(String(document.status ?? ""));
}
