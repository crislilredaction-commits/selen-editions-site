export const DISTANCE_WITHDRAWAL_DAYS = 14;
export const INDIVIDUAL_TRAINING_WITHDRAWAL_DAYS = 10;
export const BENEFICIARY_EARLY_START_TRACE_KEY = "beneficiary_early_start_request";
export const INDIVIDUAL_EARLY_START_TEXT_VERSION = "2026-09-18-v1";
export const INDIVIDUAL_FULL_PERFORMANCE_ACKNOWLEDGEMENT_TEXT =
  "Je reconnais avoir été informé(e) que cette demande ne supprime pas immédiatement mon droit de rétractation. Si la prestation est entièrement exécutée avant la fin du délai de quatorze jours, je perdrai ce droit une fois l'exécution complète, dans les conditions prévues par la loi.";

type RequirementReason =
  | "required"
  | "company"
  | "beneficiary_with_siret"
  | "not_personally_funded"
  | "no_scheduled_start"
  | "session_already_started"
  | "outside_distance_withdrawal_period";

export type IndividualEarlyStartRequirement = {
  required: boolean;
  reason: RequirementReason;
  referenceDate: string | null;
  distanceWithdrawalDeadline: string | null;
};

type RequirementInput = {
  responseType: "beneficiary" | "company";
  beneficiarySiret: string | null;
  funding: string | null;
  sessionStartDate: string | null;
  referenceAt: string | Date;
};

type SubmissionInput = {
  earlyStartRequested: unknown;
  fullPerformanceWithdrawalLossAcknowledged: unknown;
};

type TraceInput = {
  requirement: IndividualEarlyStartRequirement;
  recordedAt: string;
  sessionId: string;
  sessionStartDate: string;
  sessionEndDate: string | null;
};

type TraceValidationInput = {
  requirement: IndividualEarlyStartRequirement;
  trace: unknown;
  sessionId: string;
  sessionStartDate: string;
  expectedRecordedAt?: string | null;
};

function parseDateOnly(value: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function formatIndividualEarlyStartDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function individualEarlyStartRequestText(sessionStartDate: string) {
  return `Je demande expressément que, si mon contrat est conclu moins de quatorze jours avant cette session, l'exécution de la formation puisse commencer le ${formatIndividualEarlyStartDate(sessionStartDate)}, avant la fin de ce délai.`;
}

function addCalendarDays(value: Date, days: number) {
  const result = new Date(value.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function parisDateOnly(referenceAt: string | Date) {
  const instant = referenceAt instanceof Date ? referenceAt : new Date(referenceAt);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function isNationwideFrenchPublicHoliday(value: Date) {
  const date = formatDateOnly(value);
  const year = value.getUTCFullYear();
  const fixed = new Set([
    `${year}-01-01`,
    `${year}-05-01`,
    `${year}-05-08`,
    `${year}-07-14`,
    `${year}-08-15`,
    `${year}-11-01`,
    `${year}-11-11`,
    `${year}-12-25`,
  ]);
  const easter = easterSunday(year);
  const movable = new Set([
    formatDateOnly(addCalendarDays(easter, 1)),
    formatDateOnly(addCalendarDays(easter, 39)),
    formatDateOnly(addCalendarDays(easter, 50)),
  ]);
  return fixed.has(date) || movable.has(date);
}

function isNonWorkingDeadline(value: Date) {
  return value.getUTCDay() === 0 || value.getUTCDay() === 6 || isNationwideFrenchPublicHoliday(value);
}

export function calculateDistanceWithdrawalDeadline(referenceAt: string | Date) {
  const referenceDate = parisDateOnly(referenceAt);
  const parsedReferenceDate = parseDateOnly(referenceDate);
  if (!parsedReferenceDate) return null;
  let deadline = addCalendarDays(parsedReferenceDate, DISTANCE_WITHDRAWAL_DAYS);
  while (isNonWorkingDeadline(deadline)) deadline = addCalendarDays(deadline, 1);
  return formatDateOnly(deadline);
}

export function getIndividualEarlyStartRequirement(input: RequirementInput): IndividualEarlyStartRequirement {
  const referenceDate = parisDateOnly(input.referenceAt);
  const distanceWithdrawalDeadline = calculateDistanceWithdrawalDeadline(input.referenceAt);
  if (input.responseType !== "beneficiary") return { required: false, reason: "company", referenceDate, distanceWithdrawalDeadline };
  if (String(input.beneficiarySiret ?? "").trim()) return { required: false, reason: "beneficiary_with_siret", referenceDate, distanceWithdrawalDeadline };
  if (input.funding !== "personnel") return { required: false, reason: "not_personally_funded", referenceDate, distanceWithdrawalDeadline };
  const sessionStart = parseDateOnly(input.sessionStartDate);
  if (!sessionStart || !referenceDate || !distanceWithdrawalDeadline) return { required: false, reason: "no_scheduled_start", referenceDate, distanceWithdrawalDeadline };
  if (input.sessionStartDate! < referenceDate) return { required: false, reason: "session_already_started", referenceDate, distanceWithdrawalDeadline };
  if (input.sessionStartDate! > distanceWithdrawalDeadline) return { required: false, reason: "outside_distance_withdrawal_period", referenceDate, distanceWithdrawalDeadline };
  return { required: true, reason: "required", referenceDate, distanceWithdrawalDeadline };
}

export function validateIndividualEarlyStartSubmission(requirement: IndividualEarlyStartRequirement, input: SubmissionInput) {
  if (!requirement.required) return { valid: true as const };
  if (input.earlyStartRequested !== true) {
    return {
      valid: false as const,
      code: "early_start_request_required" as const,
      error: "Cette session peut commencer avant la fin de votre délai de rétractation. Votre demande expresse de démarrage anticipé est nécessaire pour conserver cette date.",
    };
  }
  if (input.fullPerformanceWithdrawalLossAcknowledged !== true) {
    return {
      valid: false as const,
      code: "full_performance_acknowledgement_required" as const,
      error: "Merci de confirmer que vous avez compris la conséquence d'une exécution complète de la formation avant la fin du délai de rétractation.",
    };
  }
  return { valid: true as const };
}

export function buildIndividualEarlyStartTrace(input: TraceInput) {
  if (!input.requirement.required || !input.requirement.referenceDate || !input.requirement.distanceWithdrawalDeadline) {
    throw new Error("Early-start trace requires an applicable withdrawal period.");
  }
  return {
    version: 1,
    text_version: INDIVIDUAL_EARLY_START_TEXT_VERSION,
    requested: true,
    full_performance_withdrawal_loss_acknowledged: true,
    request_text: individualEarlyStartRequestText(input.sessionStartDate),
    full_performance_acknowledgement_text: INDIVIDUAL_FULL_PERFORMANCE_ACKNOWLEDGEMENT_TEXT,
    recorded_at: input.recordedAt,
    context: "public_daily_application",
    request_scope: "conditional_if_contract_is_concluded_less_than_14_days_before_session_start",
    calculation_reference: "application_signature_date",
    reference_date: input.requirement.referenceDate,
    session_id: input.sessionId,
    session_start_date: input.sessionStartDate,
    session_end_date: input.sessionEndDate,
    distance_withdrawal_deadline_if_contract_concluded_on_reference_date: input.requirement.distanceWithdrawalDeadline,
    distance_withdrawal_days: DISTANCE_WITHDRAWAL_DAYS,
    individual_training_withdrawal_days: INDIVIDUAL_TRAINING_WITHDRAWAL_DAYS,
    legal_basis: [
      "Code du travail L6353-5 et L6353-6",
      "Code de la consommation L221-18, L221-19, L221-25 et L221-28",
    ],
  };
}

export function validatePersistedIndividualEarlyStartTrace(input: TraceValidationInput) {
  if (!input.requirement.required) return { valid: true as const };
  const trace = input.trace && typeof input.trace === "object" && !Array.isArray(input.trace)
    ? input.trace as Record<string, unknown>
    : null;
  const recordedAt = String(trace?.recorded_at ?? "");
  const valid = Boolean(
    trace
    && trace.text_version === INDIVIDUAL_EARLY_START_TEXT_VERSION
    && trace.requested === true
    && trace.full_performance_withdrawal_loss_acknowledged === true
    && trace.request_text === individualEarlyStartRequestText(input.sessionStartDate)
    && trace.full_performance_acknowledgement_text === INDIVIDUAL_FULL_PERFORMANCE_ACKNOWLEDGEMENT_TEXT
    && trace.session_id === input.sessionId
    && trace.session_start_date === input.sessionStartDate
    && recordedAt
    && !Number.isNaN(new Date(recordedAt).getTime())
    && (!input.expectedRecordedAt || recordedAt === input.expectedRecordedAt)
  );
  if (valid) return { valid: true as const };
  return {
    valid: false as const,
    error: "Cette session commence dans la période de rétractation protégée. Aucune demande expresse vérifiable n'est enregistrée pour cette session : choisissez une date ultérieure ou recueillez une nouvelle demande signée du bénéficiaire.",
  };
}
