import { createHash, randomBytes, randomInt } from "crypto";


export const DAILY_ATTENDANCE_TIME_ZONE = "Europe/Paris";

export function attendanceParisClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_ATTENDANCE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

export function attendanceSlotHasStarted(
  slot: { slot_date: string; starts_at: string },
  now = new Date(),
) {
  const clock = attendanceParisClock(now);
  if (clock.date !== slot.slot_date) return clock.date > slot.slot_date;
  const [hours, minutes] = slot.starts_at.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return false;
  return clock.minutes >= hours * 60 + minutes;
}

export const DAILY_ATTENDANCE_CONSENT =
  "Je confirme ma présence pour ce créneau de formation et j’accepte que ma signature électronique, la date et l’heure de signature ainsi que les éléments techniques de preuve soient conservés dans le dossier de formation.";

export function createAttendanceToken() {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashAttendanceToken(token) };
}

export function hashAttendanceToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function createAttendanceVerificationCode() {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { code, codeHash: hashAttendanceVerificationCode(code) };
}

export function hashAttendanceVerificationCode(code: string) {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export function hashAttendanceEmail(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function hashAttendanceSignature(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function buildAttendanceProofHash(values: {
  organisationId: string;
  sessionId: string;
  slotId: string;
  enrolmentId: string;
  signedAt: string;
  consentText: string;
  signatureSha256: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return createHash("sha256")
    .update([
      values.organisationId,
      values.sessionId,
      values.slotId,
      values.enrolmentId,
      values.signedAt,
      values.consentText,
      values.signatureSha256,
      values.ipAddress ?? "",
      values.userAgent ?? "",
    ].join("|"))
    .digest("hex");
}

export function attendanceMode(session: {
  modality?: string | null;
  distance_mode?: string | null;
}) {
  if (session.modality === "presentiel") return "presentiel";
  if (session.modality === "distanciel") {
    return session.distance_mode === "asynchrone"
      ? "distanciel_asynchrone"
      : "distanciel_synchrone";
  }
  return "presentiel";
}

export function attendanceChannel(mode: string, individual: boolean) {
  if (individual) return "link";
  return mode === "presentiel" ? "qr" : "chat";
}

export function signatureBufferFromDataUrl(value: string) {
  const prefix = "data:image/png;base64,";
  if (!value.startsWith(prefix)) return null;
  const payload = value.slice(prefix.length);
  if (!payload || payload.length > 2_000_000) return null;
  try {
    const buffer = Buffer.from(payload, "base64");
    if (buffer.length === 0 || buffer.length > 1_000_000) return null;
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < pngSignature.length || !buffer.subarray(0, pngSignature.length).equals(pngSignature)) return null;
    return buffer;
  } catch {
    return null;
  }
}
