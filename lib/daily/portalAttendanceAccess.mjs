/**
 * Validate the complete timestamp, not just Date.parse's permissive interpretation.
 * PostgREST emits ISO-8601 timestamps with an explicit timezone; legacy null
 * deadlines remain supported, but numeric years and impossible dates fail closed.
 */
export function isValidPortalExpiry(expiresAt, now = Date.now()) {
  if (expiresAt == null) return true;
  if (typeof expiresAt !== "string" || !expiresAt.trim()) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(expiresAt);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (!maxDays || day < 1 || day > maxDays) return false;
  const deadline = Date.parse(expiresAt);
  return Number.isFinite(deadline) && deadline > now;
}

/**
 * Access for attendance and portal actions must fail closed.
 * Legacy links without an expiry remain valid only while the token is active.
 */
export function isActivePortalAttendanceToken(status, expiresAt, now = Date.now()) {
  return (status === "pending" || status === "viewed") && isValidPortalExpiry(expiresAt, now);
}
