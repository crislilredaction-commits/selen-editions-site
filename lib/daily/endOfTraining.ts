export type AttendanceEndSlot = {
  slot_date?: string | null;
  ends_at?: string | null;
};

type AvailabilityInput = {
  mode: string;
  assessmentSubmitted: boolean;
  endDate?: string | null;
  finalSlot?: AttendanceEndSlot | null;
  now?: Date;
};

function numberPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return Number(parts.find((part) => part.type === type)?.value ?? 0);
}

function parisOffsetMs(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const localAsUtc = Date.UTC(
    numberPart(parts, "year"),
    numberPart(parts, "month") - 1,
    numberPart(parts, "day"),
    numberPart(parts, "hour"),
    numberPart(parts, "minute"),
    numberPart(parts, "second"),
  );
  return localAsUtc - instant.getTime();
}

export function parisLocalDateTimeToInstant(date: string, time: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(time.trim());
  if (!dateMatch || !timeMatch) return null;

  const localAsUtc = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    Number(timeMatch[3] ?? 0),
  );
  let instantMs = localAsUtc - parisOffsetMs(new Date(localAsUtc));
  instantMs = localAsUtc - parisOffsetMs(new Date(instantMs));
  const instant = new Date(instantMs);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

export function parisDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function getLearnerSatisfactionAvailability({
  mode,
  assessmentSubmitted,
  endDate,
  finalSlot,
  now = new Date(),
}: AvailabilityInput) {
  if (mode === "selen_quiz") {
    return {
      available: assessmentSubmitted,
      availableFrom: null as string | null,
      reason: assessmentSubmitted ? "assessment_submitted" : "assessment_required",
    };
  }

  if (mode !== "external") {
    return { available: false, availableFrom: null as string | null, reason: "unsupported_mode" };
  }

  const slotEnd = finalSlot?.slot_date && finalSlot?.ends_at
    ? parisLocalDateTimeToInstant(finalSlot.slot_date, finalSlot.ends_at)
    : null;
  if (slotEnd) {
    const availableFrom = new Date(slotEnd.getTime() - 2 * 60 * 60 * 1000);
    return {
      available: now.getTime() >= availableFrom.getTime(),
      availableFrom: availableFrom.toISOString(),
      reason: "trainer_managed_h_minus_2",
    };
  }

  const endedOnPreviousDay = Boolean(endDate && parisDateKey(now) > endDate);
  return {
    available: endedOnPreviousDay,
    availableFrom: null as string | null,
    reason: endedOnPreviousDay ? "session_ended_without_slot" : "final_slot_required",
  };
}
