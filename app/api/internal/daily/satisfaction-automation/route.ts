import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import {
  activeDailyEnrolment,
  createDailyFeedbackToken,
  dailyFeedbackPath,
} from "@/lib/server/dailyEndEvaluations";
import {
  prepareDailySatisfactionReminderEmail,
  prepareDailySatisfactionRequestEmail,
  sendDailySatisfactionReminder,
  sendDailySatisfactionRequest,
} from "@/lib/server/dailyEndEvaluationEmails";

const PARIS_TIME_ZONE = "Europe/Paris";
const REMINDER_INTERVAL_DAYS = 3;
const MAX_FEEDBACK_WINDOW_DAYS = 30;

type Phase = "request" | "reminder";

type Learner = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

type EnrolmentRow = {
  id: string;
  organisation_id: string;
  session_id: string;
  status: string | null;
  daily_learners: Learner | Learner[] | null;
};

type SessionRow = {
  id: string;
  organisation_id: string;
  end_date: string | null;
  status: string | null;
  daily_formations: { title?: string | null } | { title?: string | null }[] | null;
};

type CommunicationRow = {
  id: string;
  session_id: string | null;
  enrolment_id: string | null;
  communication_type: string;
  status: string;
  created_at: string;
  sent_at: string | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parisDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T12:00:00.000Z`).getTime();
  const end = new Date(`${to}T12:00:00.000Z`).getTime();
  return Math.floor((end - start) / 86_400_000);
}

function authorized(req: Request) {
  const expected = process.env.DAILY_AUTOMATION_SECRET?.trim();
  if (!expected) {
    return { ok: false as const, status: 503, error: "DAILY_AUTOMATION_SECRET manquant." };
  }
  const received = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!received || received !== expected) {
    return { ok: false as const, status: 401, error: "Accès refusé." };
  }
  return { ok: true as const };
}

function successfulCommunication(row: CommunicationRow) {
  return ["queued", "sent", "delivered"].includes(row.status);
}

function communicationTime(row: CommunicationRow) {
  return new Date(row.sent_at || row.created_at).getTime();
}

function feedbackExpiry(endDate: string) {
  const expiry = new Date(`${endDate}T12:00:00.000Z`);
  expiry.setUTCDate(expiry.getUTCDate() + MAX_FEEDBACK_WINDOW_DAYS);
  return expiry.toISOString();
}

function formationTitle(session: SessionRow) {
  return one(session.daily_formations)?.title?.trim() || "Formation Selen Daily";
}

export async function GET(req: Request) {
  const access = authorized(req);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const url = new URL(req.url);
  const execute = url.searchParams.get("execute") === "1";
  const today = parisDate();
  const windowStart = addDays(today, -MAX_FEEDBACK_WINDOW_DAYS);
  const admin = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,end_date,status,daily_formations(title)")
    .not("end_date", "is", null)
    .gte("end_date", windowStart)
    .lte("end_date", today)
    .neq("status", "archived")
    .order("end_date", { ascending: true });

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

  const sessions = (sessionData ?? []) as SessionRow[];
  if (sessions.length === 0) {
    return NextResponse.json({ ok: true, execute, date: today, due: 0, processed: 0, skipped: 0, failed: 0 });
  }

  const sessionIds = sessions.map((session) => session.id);
  const [enrolmentsResult, feedbackResult, communicationsResult] = await Promise.all([
    admin
      .from("daily_session_enrolments")
      .select("id,organisation_id,session_id,status,daily_learners(first_name,last_name,email)")
      .in("session_id", sessionIds),
    admin
      .from("daily_learner_feedback_responses")
      .select("session_id,enrolment_id")
      .in("session_id", sessionIds),
    admin
      .from("daily_communications")
      .select("id,session_id,enrolment_id,communication_type,status,created_at,sent_at")
      .in("session_id", sessionIds)
      .in("communication_type", ["satisfaction_request", "satisfaction_reminder"])
      .in("status", ["queued", "sent", "delivered", "failed"]),
  ]);

  const readError = enrolmentsResult.error ?? feedbackResult.error ?? communicationsResult.error;
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const enrolments = (enrolmentsResult.data ?? []) as EnrolmentRow[];
  const completedFeedback = new Set(
    (feedbackResult.data ?? []).map((row) => `${row.session_id}:${row.enrolment_id}`),
  );
  const communications = (communicationsResult.data ?? []) as CommunicationRow[];
  const sessionMap = new Map(sessions.map((session) => [session.id, session]));

  let due = 0;
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const details: Array<{ session_id: string; enrolment_id: string; phase: Phase; status: string }> = [];

  for (const enrolment of enrolments.filter((row) => activeDailyEnrolment(row.status))) {
    const session = sessionMap.get(enrolment.session_id);
    if (!session?.end_date) continue;

    const key = `${enrolment.session_id}:${enrolment.id}`;
    if (completedFeedback.has(key)) {
      skipped += 1;
      continue;
    }

    const ageDays = daysBetween(session.end_date, today);
    if (ageDays < 0 || ageDays > MAX_FEEDBACK_WINDOW_DAYS) continue;

    const history = communications
      .filter(
        (row) =>
          row.session_id === enrolment.session_id &&
          row.enrolment_id === enrolment.id &&
          successfulCommunication(row),
      )
      .sort((a, b) => communicationTime(b) - communicationTime(a));

    const hasRequest = history.some((row) => row.communication_type === "satisfaction_request");
    let phase: Phase | null = null;

    if (!hasRequest) {
      phase = "request";
    } else {
      const latest = history[0];
      if (!latest) continue;
      const lastSentDate = parisDate(new Date(latest.sent_at || latest.created_at));
      if (daysBetween(lastSentDate, today) >= REMINDER_INTERVAL_DAYS) {
        phase = "reminder";
      }
    }

    if (!phase) {
      skipped += 1;
      continue;
    }

    const learner = one(enrolment.daily_learners);
    const email = text(learner?.email).toLowerCase();
    if (!email) {
      skipped += 1;
      details.push({ session_id: enrolment.session_id, enrolment_id: enrolment.id, phase, status: "missing_email" });
      continue;
    }

    due += 1;
    if (!execute) {
      details.push({ session_id: enrolment.session_id, enrolment_id: enrolment.id, phase, status: "due" });
      continue;
    }

    const { error: revokeError } = await admin
      .from("daily_learner_feedback_tokens")
      .update({ status: "revoked" })
      .eq("organisation_id", enrolment.organisation_id)
      .eq("session_id", enrolment.session_id)
      .eq("enrolment_id", enrolment.id)
      .eq("status", "active");

    if (revokeError) {
      failed += 1;
      details.push({ session_id: enrolment.session_id, enrolment_id: enrolment.id, phase, status: "token_revoke_failed" });
      continue;
    }

    const { token, tokenHash } = createDailyFeedbackToken();
    const expiresAt = feedbackExpiry(session.end_date);
    const { data: tokenRow, error: tokenError } = await admin
      .from("daily_learner_feedback_tokens")
      .insert({
        organisation_id: enrolment.organisation_id,
        session_id: enrolment.session_id,
        enrolment_id: enrolment.id,
        token_hash: tokenHash,
        status: "active",
        expires_at: expiresAt,
        created_by: null,
      })
      .select("id")
      .single();

    if (tokenError || !tokenRow) {
      failed += 1;
      details.push({ session_id: enrolment.session_id, enrolment_id: enrolment.id, phase, status: "token_create_failed" });
      continue;
    }

    const learnerName = [learner?.first_name, learner?.last_name].map(text).filter(Boolean).join(" ");
    const feedbackUrl = new URL(dailyFeedbackPath(token), url.origin).toString();
    const emailInput = {
      email,
      learnerName,
      formationTitle: formationTitle(session),
      feedbackUrl,
      expiresAt,
    };
    const prepared = phase === "request"
      ? prepareDailySatisfactionRequestEmail(emailInput)
      : prepareDailySatisfactionReminderEmail(emailInput);
    const communicationType = phase === "request" ? "satisfaction_request" : "satisfaction_reminder";

    const { data: communication, error: evidenceError } = await admin
      .from("daily_communications")
      .insert({
        organisation_id: enrolment.organisation_id,
        session_id: enrolment.session_id,
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
          feedback_token_id: tokenRow.id,
          expires_at: expiresAt,
          automation_phase: phase,
          reminder_interval_days: REMINDER_INTERVAL_DAYS,
        },
      })
      .select("id")
      .single();

    if (evidenceError || !communication) {
      await admin.from("daily_learner_feedback_tokens").update({ status: "revoked" }).eq("id", tokenRow.id);
      failed += 1;
      details.push({ session_id: enrolment.session_id, enrolment_id: enrolment.id, phase, status: "evidence_failed" });
      continue;
    }

    const sent = phase === "request"
      ? await sendDailySatisfactionRequest(emailInput)
      : await sendDailySatisfactionReminder(emailInput);

    if (!sent.sent) {
      const failedAt = new Date().toISOString();
      await Promise.all([
        admin.from("daily_learner_feedback_tokens").update({ status: "revoked" }).eq("id", tokenRow.id),
        admin
          .from("daily_communications")
          .update({ status: "failed", failed_at: failedAt, failure_reason: sent.reason })
          .eq("id", communication.id),
      ]);
      failed += 1;
      details.push({ session_id: enrolment.session_id, enrolment_id: enrolment.id, phase, status: sent.reason });
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

    processed += 1;
    details.push({
      session_id: enrolment.session_id,
      enrolment_id: enrolment.id,
      phase,
      status: finalizeError ? "sent_evidence_finalize_failed" : "sent",
    });
  }

  return NextResponse.json(
    {
      ok: failed === 0,
      execute,
      date: today,
      reminderIntervalDays: REMINDER_INTERVAL_DAYS,
      feedbackWindowDays: MAX_FEEDBACK_WINDOW_DAYS,
      due,
      processed,
      skipped,
      failed,
      details,
    },
    { status: failed === 0 ? 200 : 207 },
  );
}
