import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { attendanceChannel, createAttendanceToken } from "@/lib/server/dailyAttendance";
import {
  prepareDailyAttendanceReminder,
  prepareDailyAttendanceRequest,
  sendDailyAttendanceReminder,
  sendDailyAttendanceRequest,
} from "@/lib/server/dailyAttendanceEmails";

const PARIS_TIME_ZONE = "Europe/Paris";

type Phase = "start" | "end";

type Learner = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

type EnrolmentRow = {
  id: string;
  session_id: string;
  status: string | null;
  daily_learners: Learner | Learner[] | null;
};

type SlotRow = {
  id: string;
  organisation_id: string;
  session_id: string;
  slot_date: string;
  starts_at: string;
  ends_at: string;
  mode: string;
  label: string | null;
  status: string;
};

type SessionRow = {
  id: string;
  status: string | null;
  daily_formations: { title?: string | null } | { title?: string | null }[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parisClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TIME_ZONE,
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

function timeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function activeEnrolment(status?: string | null) {
  return !["declined", "cancelled", "completed"].includes(status ?? "");
}

function linkExpiry(slotDate: string) {
  const date = new Date(`${slotDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 3);
  return date.toISOString();
}

function formationTitle(session?: SessionRow | null) {
  const formation = one(session?.daily_formations);
  return formation?.title || "Formation Selen Daily";
}

function slotLabel(slot: SlotRow) {
  const label = new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${slot.slot_date}T12:00:00+02:00`));
  return `${label} · ${slot.starts_at.slice(0, 5)} à ${slot.ends_at.slice(0, 5)}${slot.label ? ` · ${slot.label}` : ""}`;
}

function authorized(req: Request) {
  const expected = process.env.DAILY_AUTOMATION_SECRET?.trim();
  if (!expected) return { ok: false as const, status: 503, error: "DAILY_AUTOMATION_SECRET manquant." };
  const received = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!received || received !== expected) return { ok: false as const, status: 401, error: "Accès refusé." };
  return { ok: true as const };
}

export async function GET(req: Request) {
  const access = authorized(req);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const url = new URL(req.url);
  const execute = url.searchParams.get("execute") === "1";
  const admin = getAdminSupabase();
  const clock = parisClock();

  const { data: slotData, error: slotsError } = await admin
    .from("daily_attendance_slots")
    .select("id,organisation_id,session_id,slot_date,starts_at,ends_at,mode,label,status")
    .eq("slot_date", clock.date)
    .in("status", ["draft", "open"])
    .order("starts_at", { ascending: true });
  if (slotsError) return NextResponse.json({ error: slotsError.message }, { status: 500 });

  const slots = (slotData ?? []) as SlotRow[];
  if (slots.length === 0) {
    return NextResponse.json({ ok: true, execute, date: clock.date, due: 0, processed: 0, skipped: 0, failed: 0 });
  }

  const sessionIds = [...new Set(slots.map((slot) => slot.session_id))];
  const slotIds = slots.map((slot) => slot.id);

  const [sessionsResult, enrolmentsResult, recordsResult, communicationsResult] = await Promise.all([
    admin
      .from("daily_sessions")
      .select("id,status,daily_formations(title)")
      .in("id", sessionIds),
    admin
      .from("daily_session_enrolments")
      .select("id,session_id,status,daily_learners(first_name,last_name,email)")
      .in("session_id", sessionIds),
    admin
      .from("daily_attendance_records")
      .select("slot_id,enrolment_id,status")
      .in("slot_id", slotIds),
    admin
      .from("daily_communications")
      .select("session_id,enrolment_id,communication_type,status,metadata,created_at")
      .in("session_id", sessionIds)
      .in("communication_type", ["attendance_request", "attendance_reminder"])
      .in("status", ["queued", "sent"]),
  ]);

  const readError = sessionsResult.error ?? enrolmentsResult.error ?? recordsResult.error ?? communicationsResult.error;
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const sessions = new Map(((sessionsResult.data ?? []) as SessionRow[]).map((row) => [row.id, row]));
  const enrolments = (enrolmentsResult.data ?? []) as EnrolmentRow[];
  const records = recordsResult.data ?? [];
  const communications = communicationsResult.data ?? [];
  const origin = url.origin;

  let due = 0;
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const details: Array<{ slot_id: string; enrolment_id: string; phase: Phase; status: string }> = [];

  for (const slot of slots) {
    const startsAt = timeMinutes(slot.starts_at);
    const endsAt = timeMinutes(slot.ends_at);
    if (startsAt === null || endsAt === null) continue;

    let phase: Phase | null = null;
    if (clock.minutes >= endsAt) phase = "end";
    else if (clock.minutes >= startsAt) phase = "start";
    if (!phase) continue;

    const session = sessions.get(slot.session_id);
    if (!session || session.status === "archived") continue;

    for (const enrolment of enrolments.filter((row) => row.session_id === slot.session_id && activeEnrolment(row.status))) {
      const attendance = records.find((row) => row.slot_id === slot.id && row.enrolment_id === enrolment.id);
      if (!attendance || attendance.status !== "pending") {
        skipped += 1;
        continue;
      }

      const communicationType = phase === "start" ? "attendance_request" : "attendance_reminder";
      const alreadyHandled = communications.some((row) => {
        const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
        return row.session_id === slot.session_id
          && row.enrolment_id === enrolment.id
          && row.communication_type === communicationType
          && metadata.attendance_slot_id === slot.id;
      });
      if (alreadyHandled) {
        skipped += 1;
        continue;
      }

      const learner = one(enrolment.daily_learners);
      const email = text(learner?.email).toLowerCase();
      if (!email) {
        skipped += 1;
        details.push({ slot_id: slot.id, enrolment_id: enrolment.id, phase, status: "missing_email" });
        continue;
      }

      due += 1;
      if (!execute) {
        details.push({ slot_id: slot.id, enrolment_id: enrolment.id, phase, status: "due" });
        continue;
      }

      const { error: revokeError } = await admin
        .from("daily_attendance_access_tokens")
        .update({ status: "revoked" })
        .eq("organisation_id", slot.organisation_id)
        .eq("slot_id", slot.id)
        .eq("enrolment_id", enrolment.id)
        .eq("status", "active");
      if (revokeError) {
        failed += 1;
        details.push({ slot_id: slot.id, enrolment_id: enrolment.id, phase, status: "token_revoke_failed" });
        continue;
      }

      const { token, tokenHash } = createAttendanceToken();
      const expiresAt = linkExpiry(slot.slot_date);
      const { data: tokenRow, error: tokenError } = await admin
        .from("daily_attendance_access_tokens")
        .insert({
          organisation_id: slot.organisation_id,
          session_id: slot.session_id,
          slot_id: slot.id,
          enrolment_id: enrolment.id,
          token_hash: tokenHash,
          access_type: "individual",
          channel: attendanceChannel(slot.mode, true),
          status: "active",
          expires_at: expiresAt,
          created_by: null,
        })
        .select("id")
        .single();
      if (tokenError || !tokenRow) {
        failed += 1;
        details.push({ slot_id: slot.id, enrolment_id: enrolment.id, phase, status: "token_create_failed" });
        continue;
      }

      const learnerName = [learner?.first_name, learner?.last_name].filter(Boolean).join(" ").trim();
      const emailInput = {
        email,
        learnerName,
        formationTitle: formationTitle(session),
        slotLabel: slotLabel(slot),
        attendanceUrl: `${origin}/daily-emargement/${token}`,
      };
      const prepared = phase === "start"
        ? prepareDailyAttendanceRequest(emailInput)
        : prepareDailyAttendanceReminder(emailInput);

      const { data: communication, error: evidenceError } = await admin
        .from("daily_communications")
        .insert({
          organisation_id: slot.organisation_id,
          session_id: slot.session_id,
          enrolment_id: enrolment.id,
          communication_type: communicationType,
          channel: "email",
          recipient_email: email,
          recipient_name: learnerName || null,
          subject: prepared.subject,
          text_body: prepared.text,
          html_body: prepared.html,
          provider: "resend",
          status: "queued",
          created_by: null,
          metadata: {
            attendance_slot_id: slot.id,
            attendance_access_token_id: tokenRow.id,
            token_expires_at: expiresAt,
            automation_phase: phase,
          },
        })
        .select("id")
        .single();

      if (evidenceError || !communication) {
        await admin.from("daily_attendance_access_tokens").update({ status: "revoked" }).eq("id", tokenRow.id);
        failed += 1;
        details.push({ slot_id: slot.id, enrolment_id: enrolment.id, phase, status: "evidence_failed" });
        continue;
      }

      const sent = phase === "start"
        ? await sendDailyAttendanceRequest(emailInput)
        : await sendDailyAttendanceReminder(emailInput);
      if (!sent.sent) {
        const failedAt = new Date().toISOString();
        await Promise.all([
          admin.from("daily_attendance_access_tokens").update({ status: "revoked" }).eq("id", tokenRow.id),
          admin.from("daily_communications").update({ status: "failed", failed_at: failedAt, failure_reason: sent.reason }).eq("id", communication.id),
        ]);
        failed += 1;
        details.push({ slot_id: slot.id, enrolment_id: enrolment.id, phase, status: sent.reason });
        continue;
      }

      const sentAt = new Date().toISOString();
      const { error: finalizeError } = await admin
        .from("daily_communications")
        .update({
          provider_message_id: sent.message.providerMessageId,
          status: "sent",
          sent_at: sentAt,
          failed_at: null,
          failure_reason: null,
        })
        .eq("id", communication.id);

      if (slot.status === "draft") {
        await admin
          .from("daily_attendance_slots")
          .update({ status: "open", updated_at: sentAt })
          .eq("id", slot.id)
          .eq("status", "draft");
      }

      processed += 1;
      details.push({ slot_id: slot.id, enrolment_id: enrolment.id, phase, status: finalizeError ? "sent_evidence_finalize_failed" : "sent" });
    }
  }

  return NextResponse.json({
    ok: failed === 0,
    execute,
    date: clock.date,
    due,
    processed,
    skipped,
    failed,
    details,
  }, { status: failed === 0 ? 200 : 207 });
}
