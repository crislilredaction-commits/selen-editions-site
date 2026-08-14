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
  return status !== "cancelled" && status !== "declined";
}
