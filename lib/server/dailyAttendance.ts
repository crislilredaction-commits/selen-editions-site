import { createHash, randomBytes } from "crypto";

export const DAILY_ATTENDANCE_CONSENT =
  "Je confirme ma présence pour ce créneau de formation et j’accepte que ma signature électronique, la date et l’heure de signature ainsi que les éléments techniques de preuve soient conservés dans le dossier de formation.";

export function createAttendanceToken() {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashAttendanceToken(token) };
}

export function hashAttendanceToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
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
    return buffer;
  } catch {
    return null;
  }
}
