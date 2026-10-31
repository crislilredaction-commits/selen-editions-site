import { createHash, randomBytes } from "crypto";

export function createDailyFeedbackToken() {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashDailyFeedbackToken(token) };
}

export function hashDailyFeedbackToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function dailyFeedbackPath(token: string) {
  return `/daily-satisfaction/${token}`;
}

export function activeDailyEnrolment(status?: string | null) {
  return status !== "cancelled" && status !== "declined" && status !== "abandoned";
}

/**
 * Satisfaction links remain usable for 30 days after creation, even when a
 * questionnaire is sent long after a session ended. Future sessions keep the
 * intended 30-day post-session window.
 */
export function dailyFeedbackExpiresAt(endDate: string | null | undefined, now = new Date()) {
  const candidate = typeof endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ? new Date(`${endDate}T12:00:00.000Z`)
    : null;
  const validEnd = candidate && !Number.isNaN(candidate.getTime())
    && candidate.toISOString().slice(0, 10) === endDate ? candidate : null;
  const base = validEnd && validEnd.getTime() > now.getTime() ? validEnd : now;
  const expiry = new Date(base.getTime());
  expiry.setUTCDate(expiry.getUTCDate() + 30);
  return expiry.toISOString();
}
