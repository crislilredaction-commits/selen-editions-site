import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { activeDailyEnrolment } from "@/lib/server/dailyEndEvaluations";
import {
  prepareDailyAssessmentReminderEmail,
  sendDailyAssessmentReminder,
} from "@/lib/server/dailyAssessmentReminderEmails";

const PARIS_TIME_ZONE = "Europe/Paris";
const COMMUNICATION_TYPE = "learning_assessment_reminder";
const NOTIFICATION_SOURCE_KIND = "daily_learning_assessment";

type Formation = {
  title?: string | null;
  learning_assessment_mode?: string | null;
};

type SessionRow = {
  id: string;
  organisation_id: string;
  internal_reference: string | null;
  end_date: string | null;
  status: string | null;
  trainer_ids: unknown;
  daily_formations: Formation | Formation[] | null;
};

type EnrolmentRow = {
  id: string;
  organisation_id: string;
  session_id: string;
  status: string | null;
};

type TrainerRow = {
  id: string;
  organisation_id: string;
  user_id: string | null;
  professional_email: string | null;
  display_name: string | null;
  active: boolean | null;
};

type CommunicationRow = {
  session_id: string | null;
  recipient_email: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

type NotificationRow = {
  source_key: string | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTrainerIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => text(item)).filter(Boolean);
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

function alreadySentToday(
  communications: CommunicationRow[],
  sessionId: string,
  email: string,
  today: string,
) {
  return communications.some((row) =>
    row.session_id === sessionId &&
    row.recipient_email.toLowerCase() === email.toLowerCase() &&
    ["queued", "sent", "delivered"].includes(row.status) &&
    text(row.metadata?.automation_day) === today,
  );
}

function notificationSourceKey(sessionId: string, today: string) {
  return `external-assessment:${sessionId}:${today}`;
}

export async function GET(req: Request) {
  const access = authorized(req);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const url = new URL(req.url);
  const execute = url.searchParams.get("execute") === "1";
  const today = parisDate();
  const admin = getAdminSupabase();

  const { data: sessionData, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,internal_reference,end_date,status,trainer_ids,daily_formations(title,learning_assessment_mode)")
    .eq("end_date", today)
    .neq("status", "archived")
    .order("internal_reference", { ascending: true });

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

  const sessions = (sessionData ?? []) as SessionRow[];
  const externalSessions = sessions.filter((session) => one(session.daily_formations)?.learning_assessment_mode !== "selen_quiz");
  if (externalSessions.length === 0) {
    return NextResponse.json({ ok: true, execute, date: today, due: 0, processed: 0, skipped: 0, failed: 0 });
  }

  const sessionIds = externalSessions.map((session) => session.id);
  const sourceKeys = sessionIds.map((sessionId) => notificationSourceKey(sessionId, today));
  const trainerIds = Array.from(new Set(externalSessions.flatMap((session) => parseTrainerIds(session.trainer_ids))));

  const [enrolmentsResult, evidenceResult, communicationsResult, trainersResult, notificationsResult] = await Promise.all([
    admin
      .from("daily_session_enrolments")
      .select("id,organisation_id,session_id,status")
      .in("session_id", sessionIds),
    admin
      .from("daily_documents")
      .select("linked_object_id")
      .eq("document_type", "learning_assessment_evidence")
      .eq("linked_object_type", "enrolment")
      .eq("is_current", true)
      .is("archived_at", null),
    admin
      .from("daily_communications")
      .select("session_id,recipient_email,status,metadata")
      .in("session_id", sessionIds)
      .eq("communication_type", COMMUNICATION_TYPE)
      .in("status", ["queued", "sent", "delivered", "failed"]),
    trainerIds.length > 0
      ? admin
        .from("daily_trainer_profiles")
        .select("id,organisation_id,user_id,professional_email,display_name,active")
        .in("id", trainerIds)
      : Promise.resolve({ data: [] as TrainerRow[], error: null }),
    admin
      .from("notifications")
      .select("source_key")
      .eq("source_kind", NOTIFICATION_SOURCE_KIND)
      .in("source_key", sourceKeys),
  ]);

  const readError =
    enrolmentsResult.error ??
    evidenceResult.error ??
    communicationsResult.error ??
    trainersResult.error ??
    notificationsResult.error;
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const enrolments = (enrolmentsResult.data ?? []) as EnrolmentRow[];
  const evidenceIds = new Set((evidenceResult.data ?? []).map((row) => row.linked_object_id).filter(Boolean));
  const communications = (communicationsResult.data ?? []) as CommunicationRow[];
  const trainers = (trainersResult.data ?? []) as TrainerRow[];
  const trainerMap = new Map(trainers.map((trainer) => [trainer.id, trainer]));
  const existingNotificationKeys = new Set(
    ((notificationsResult.data ?? []) as NotificationRow[]).map((row) => text(row.source_key)).filter(Boolean),
  );

  let due = 0;
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const details: Array<{
    session_id: string;
    trainer_id?: string;
    status: string;
    missing_evidence?: number;
  }> = [];

  for (const session of externalSessions) {
    const activeEnrolments = enrolments.filter(
      (row) => row.session_id === session.id && activeDailyEnrolment(row.status),
    );
    if (activeEnrolments.length === 0) {
      skipped += 1;
      details.push({ session_id: session.id, status: "no_active_enrolments" });
      continue;
    }

    const missingEvidence = activeEnrolments.filter((row) => !evidenceIds.has(row.id));
    if (missingEvidence.length === 0) {
      skipped += 1;
      details.push({ session_id: session.id, status: "evidence_complete" });
      continue;
    }

    const formation = one(session.daily_formations);
    const formationTitle = text(formation?.title) || "Formation Selen Daily";
    const sessionReference = text(session.internal_reference) || formationTitle;
    const assignedTrainerIds = parseTrainerIds(session.trainer_ids);
    const sourceKey = notificationSourceKey(session.id, today);

    if (execute && !existingNotificationKeys.has(sourceKey)) {
      const { error: notificationError } = await admin.from("notifications").insert({
        type: "daily_action",
        title: "Évaluations externes à récupérer",
        content: `${sessionReference} · ${missingEvidence.length} preuve${missingEvidence.length > 1 ? "s" : ""} d’évaluation manquante${missingEvidence.length > 1 ? "s" : ""}.`,
        link_path: `/agent/daily/session-dossiers/${session.id}`,
        source_kind: NOTIFICATION_SOURCE_KIND,
        source_key: sourceKey,
        target_role: "agent",
        pinned: true,
      });
      if (notificationError) {
        failed += 1;
        details.push({ session_id: session.id, status: "agent_notification_failed" });
      } else {
        existingNotificationKeys.add(sourceKey);
      }
    }

    if (assignedTrainerIds.length === 0) {
      due += 1;
      skipped += 1;
      details.push({
        session_id: session.id,
        status: "missing_trainer",
        missing_evidence: missingEvidence.length,
      });
      continue;
    }

    for (const trainerId of assignedTrainerIds) {
      const trainer = trainerMap.get(trainerId);
      if (!trainer || trainer.organisation_id !== session.organisation_id || trainer.active === false) {
        skipped += 1;
        details.push({ session_id: session.id, trainer_id: trainerId, status: "trainer_unavailable" });
        continue;
      }

      const email = text(trainer.professional_email).toLowerCase();
      if (!email) {
        due += 1;
        skipped += 1;
        details.push({ session_id: session.id, trainer_id: trainerId, status: "missing_trainer_email" });
        continue;
      }

      if (alreadySentToday(communications, session.id, email, today)) {
        skipped += 1;
        details.push({ session_id: session.id, trainer_id: trainerId, status: "already_sent_today" });
        continue;
      }

      due += 1;
      if (!execute) {
        details.push({
          session_id: session.id,
          trainer_id: trainerId,
          status: "due",
          missing_evidence: missingEvidence.length,
        });
        continue;
      }

      const uploadUrl = new URL("/client/daily/evaluations/preuves", url.origin).toString();
      const emailInput = {
        email,
        trainerName: text(trainer.display_name),
        formationTitle,
        sessionReference,
        missingCount: missingEvidence.length,
        uploadUrl,
      };
      const prepared = prepareDailyAssessmentReminderEmail(emailInput);

      const { data: communication, error: evidenceError } = await admin
        .from("daily_communications")
        .insert({
          organisation_id: session.organisation_id,
          session_id: session.id,
          enrolment_id: null,
          communication_type: COMMUNICATION_TYPE,
          channel: "email",
          recipient_email: email,
          recipient_name: text(trainer.display_name) || null,
          subject: prepared.subject,
          text_body: prepared.text,
          html_body: prepared.html,
          provider: "resend",
          status: "queued",
          created_by: null,
          metadata: {
            automation_day: today,
            trainer_profile_id: trainer.id,
            trainer_user_id: trainer.user_id,
            missing_evidence_count: missingEvidence.length,
            assessment_mode: formation?.learning_assessment_mode ?? null,
          },
        })
        .select("id")
        .single();

      if (evidenceError || !communication) {
        failed += 1;
        details.push({ session_id: session.id, trainer_id: trainerId, status: "evidence_failed" });
        continue;
      }

      const sent = await sendDailyAssessmentReminder(emailInput);
      if (!sent.sent) {
        const failedAt = new Date().toISOString();
        await admin
          .from("daily_communications")
          .update({ status: "failed", failed_at: failedAt, failure_reason: sent.reason })
          .eq("organisation_id", session.organisation_id)
          .eq("id", communication.id);
        failed += 1;
        details.push({ session_id: session.id, trainer_id: trainerId, status: sent.reason });
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
        .eq("organisation_id", session.organisation_id)
        .eq("id", communication.id);

      processed += 1;
      details.push({
        session_id: session.id,
        trainer_id: trainerId,
        status: finalizeError ? "sent_evidence_finalize_failed" : "sent",
        missing_evidence: missingEvidence.length,
      });
    }
  }

  return NextResponse.json(
    { ok: failed === 0, execute, date: today, due, processed, skipped, failed, details },
    { status: failed === 0 ? 200 : 207 },
  );
}

export async function POST(req: Request) {
  return GET(req);
}
