/**
 * Access for attendance views and late-signature requests must fail closed.
 * A missing expiry is supported for legacy links; a malformed expiry is not.
 */
export function isActivePortalAttendanceToken(status, expiresAt, now = Date.now()) {
  if (status !== "pending" && status !== "viewed") return false;
  if (expiresAt == null) return true;
  if (typeof expiresAt !== "string" || !expiresAt.trim()) return false;
  const deadline = Date.parse(expiresAt);
  return Number.isFinite(deadline) && deadline > now;
}
