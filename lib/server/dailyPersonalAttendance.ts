const PARIS_TIME_ZONE = "Europe/Paris";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function parisDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isPostsessionDownloadAvailable(endDate: unknown, now = new Date()) {
  const date = text(endDate);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < parisDate(now);
}

export function personalAttendanceDocumentId(enrolmentId: unknown) {
  const id = text(enrolmentId);
  return id ? `portal:personal-attendance:${id}` : "";
}

export function personalAttendanceEnrolmentId(documentId: unknown) {
  const match = /^portal:personal-attendance:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(text(documentId));
  return match?.[1] ?? null;
}

export function attendanceIsSettled(
  slotIds: unknown[],
  records: Array<{ slot_id?: unknown; status?: unknown }>,
) {
  const expected = slotIds.map(text).filter(Boolean);
  if (!expected.length) return false;
  const statusBySlot = new Map(records.map((record) => [text(record.slot_id), text(record.status)]));
  return expected.every((slotId) => {
    const status = statusBySlot.get(slotId);
    return Boolean(status && status !== "pending");
  });
}

export function safePersonalDownloadName(value: unknown, extension = ".doc") {
  const base = text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "document";
  return base.toLowerCase().endsWith(extension.toLowerCase()) ? base : `${base}${extension}`;
}
