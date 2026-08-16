import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { sendTrainerAnnualReminder } from "@/lib/server/dailyTrainerAnnualReminderEmails";

const MAX_EMAILS_PER_RUN = 20;
const REMINDER_INTERVAL_DAYS = 7;

function authorized(request: Request) {
  const secret = process.env.DAILY_INTERNAL_REMINDER_SECRET?.trim();
  if (!secret) return { ok: false as const, status: 503, error: "Moteur de relance non activé." };
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(header);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false as const, status: 401, error: "Accès refusé." };
  }
  return { ok: true as const };
}

function nextReminder(now: Date) {
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + REMINDER_INTERVAL_DAYS);
  return next.toISOString();
}

function due(value: string | null | undefined, nowMs: number) {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) || timestamp <= nowMs;
}

export async function POST(request: Request) {
  const access = authorized(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const admin = getAdminSupabase();
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const year = now.getUTCFullYear();

  const { data: trainers, error: trainerError } = await admin
    .from("daily_trainer_profiles")
    .select("id,display_name,professional_email,status,cv_updated_at,cv_review_due_at,cv_last_reminder_at,cv_reminder_count,cv_next_reminder_at,created_at")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(200);
  if (trainerError) return NextResponse.json({ error: trainerError.message }, { status: 500 });

  const trainerIds = (trainers ?? []).map((trainer) => trainer.id);
  const reviewByTrainer = new Map<string, Record<string, unknown>>();
  if (trainerIds.length > 0) {
    const { data: reviews, error: reviewError } = await admin
      .from("daily_trainer_annual_reviews")
      .select("id,trainer_profile_id,review_year,status,last_reminder_at,reminder_count,next_reminder_at")
      .eq("review_year", year)
      .in("trainer_profile_id", trainerIds);
    if (reviewError) return NextResponse.json({ error: reviewError.message }, { status: 500 });
    for (const review of reviews ?? []) reviewByTrainer.set(review.trainer_profile_id, review);
  }

  let sent = 0;
  let failed = 0;
  let skippedWithoutEmail = 0;
  let annualReviewReminders = 0;
  let cvReminders = 0;

  for (const trainer of trainers ?? []) {
    if (sent >= MAX_EMAILS_PER_RUN) break;
    const email = String(trainer.professional_email ?? "").trim();
    if (!email) {
      skippedWithoutEmail += 1;
      continue;
    }

    let review = reviewByTrainer.get(trainer.id) ?? null;
    const reviewSubmitted = review?.status === "submitted";
    const reviewDue = !reviewSubmitted && due(review?.next_reminder_at as string | null | undefined, nowMs);

    if (reviewDue && sent < MAX_EMAILS_PER_RUN) {
      if (!review?.id) {
        const { data: created, error: createError } = await admin
          .from("daily_trainer_annual_reviews")
          .insert({ trainer_profile_id: trainer.id, review_year: year, status: "draft" })
          .select("id,trainer_profile_id,review_year,status,last_reminder_at,reminder_count,next_reminder_at")
          .single();
        if (createError || !created) {
          failed += 1;
        } else {
          review = created;
          reviewByTrainer.set(trainer.id, created);
        }
      }

      if (review?.id) {
        const result = await sendTrainerAnnualReminder({
          kind: "annual_review",
          email,
          trainerName: trainer.display_name,
          year,
          actionUrl: `${new URL(request.url).origin}/client/daily/formateur/suivi-annuel`,
        });
        if (result.sent) {
          const count = Number(review.reminder_count ?? 0) + 1;
          const { error: trackingError } = await admin
            .from("daily_trainer_annual_reviews")
            .update({
              last_reminder_at: nowIso,
              reminder_count: count,
              next_reminder_at: nextReminder(now),
              updated_at: nowIso,
            })
            .eq("id", review.id)
            .eq("trainer_profile_id", trainer.id)
            .neq("status", "submitted");
          if (trackingError) console.error("Daily : relance auto-évaluation envoyée mais suivi non finalisé", trackingError);
          sent += 1;
          annualReviewReminders += 1;
          review.reminder_count = count;
          review.next_reminder_at = nextReminder(now);
        } else {
          failed += 1;
        }
      }
    }

    if (sent >= MAX_EMAILS_PER_RUN) break;
    const cvIsDue = !trainer.cv_updated_at || due(trainer.cv_review_due_at, nowMs);
    const cvReminderDue = cvIsDue && due(trainer.cv_next_reminder_at, nowMs);
    if (!cvReminderDue) continue;

    const result = await sendTrainerAnnualReminder({
      kind: "cv",
      email,
      trainerName: trainer.display_name,
      actionUrl: `${new URL(request.url).origin}/client/daily/formateur/cv`,
    });
    if (!result.sent) {
      failed += 1;
      continue;
    }

    const count = Number(trainer.cv_reminder_count ?? 0) + 1;
    const { error: trackingError } = await admin
      .from("daily_trainer_profiles")
      .update({
        cv_last_reminder_at: nowIso,
        cv_reminder_count: count,
        cv_next_reminder_at: nextReminder(now),
        updated_at: nowIso,
      })
      .eq("id", trainer.id);
    if (trackingError) console.error("Daily : relance CV envoyée mais suivi non finalisé", trackingError);
    sent += 1;
    cvReminders += 1;
  }

  return NextResponse.json({
    ok: true,
    year,
    sent,
    failed,
    skippedWithoutEmail,
    annualReviewReminders,
    cvReminders,
    maxEmailsPerRun: MAX_EMAILS_PER_RUN,
    reminderIntervalDays: REMINDER_INTERVAL_DAYS,
  });
}
