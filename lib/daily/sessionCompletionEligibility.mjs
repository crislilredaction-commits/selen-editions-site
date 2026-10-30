// A dossier cannot be closed during its last training day or while its session is a draft.
// Evaluate the calendar day in France, independently of the server's UTC timezone.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDay(value) {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isDailySessionEligibleForClosure({ sessionStatus, endDate, stats, now = new Date() }) {
  if (sessionStatus !== "ready" || !isValidCalendarDay(endDate)) return false;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
  if (!stats || !Number.isInteger(stats.expected) || stats.expected <= 0 ||
      !Number.isInteger(stats.completed) || stats.completed !== stats.expected) return false;

  const dateParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const parts = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));
  const todayInFrance = `${parts.year}-${parts.month}-${parts.day}`;
  return endDate < todayInFrance;
}
