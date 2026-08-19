import { NextResponse } from "next/server";
import { blockedAgentAssistanceResponse, getAssistanceTokenFromRequest } from "@/lib/server/agentAssistance";
import { getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";
import { activeDailyEnrolment, createDailyFeedbackToken, dailyFeedbackPath } from "@/lib/server/dailyEndEvaluations";

const OUTCOMES = new Set(["pending", "achieved", "partially_achieved", "not_achieved", "not_applicable"]);

function text(body: Record<string, unknown>, key: string) {
  return String(body[key] ?? "").trim();
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function sessionExists(
  admin: ReturnType<typeof import("@/lib/server/clientNdaAccess").getAdminSupabase>,
  organisationId: string,
  sessionId: string,
) {
  const { data, error } = await admin
    .from("daily_sessions")
    .select("id,end_date")
    .eq("organisation_id", organisationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function refreshChecklist(
  admin: ReturnType<typeof import("@/lib/server/clientNdaAccess").getAdminSupabase>,
  organisationId: string,
  sessionId: string,
) {
  const [{ data: enrolments }, { data: assessments }, { data: responses }] = await Promise.all([
    admin.from("daily_session_enrolments").select("id,status").eq("organisation_id", organisationId).eq("session_id", sessionId),
    admin.from("daily_learning_assessments").select("enrolment_id,outcome").eq("organisation_id", organisationId).eq("session_id", sessionId),
    admin.from("daily_learner_feedback_responses").select("enrolment_id").eq("organisation_id", organisationId).eq("session_id", sessionId),
  ]);
  const active = (enrolments ?? []).filter((row) => activeDailyEnrolment(row.status));
  if (active.length === 0) return;
  const assessmentMap = new Map((assessments ?? []).map((row) => [row.enrolment_id, row.outcome]));
  const feedbackSet = new Set((responses ?? []).map((row) => row.enrolment_id));
  const anyStarted = active.some((row) => assessmentMap.get(row.id) && assessmentMap.get(row.id) !== "pending") || feedbackSet.size > 0;
  const complete = active.every((row) => assessmentMap.get(row.id) && assessmentMap.get(row.id) !== "pending" && feedbackSet.has(row.id));
  const status = complete ? "to_review" : anyStarted ? "in_progress" : "todo";
  await admin
    .from("daily_session_checklist_items")
    .update({ status })
    .eq("organisation_id", organisationId)
    .eq("session_id", sessionId)
    .eq("item_key", "end_evaluations")
    .neq("status", "not_applicable");
}

async function loadOverview(
  admin: ReturnType<typeof import("@/lib/server/clientNdaAccess").getAdminSupabase>,
  organisationId: string,
  sessionId: string,
) {
  const session = await sessionExists(admin, organisationId, sessionId);
  if (!session) return null;
  const [
    { data: enrolments, error: enrolmentError },
    { data: assessments, error: assessmentError },
    { data: responses, error: responseError },
    { data: quizResponses, error: quizResponseError },
  ] = await Promise.all([
    admin
      .from("daily_session_enrolments")
      .select("id,status,daily_learners(id,first_name,last_name,email)")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId),
    admin
      .from("daily_learning_assessments")
      .select("id,enrolment_id,outcome,score,score_max,method,notes,assessed_at,updated_at")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId),
    admin
      .from("daily_learner_feedback_responses")
      .select("id,enrolment_id,overall_rating,objectives_rating,trainer_rating,organisation_rating,content_rating,pace_rating,would_recommend,strengths,improvements,adaptation_feedback,free_comment,submitted_at")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId),
    admin
      .from("daily_learning_assessment_responses")
      .select("id,enrolment_id,question_snapshot,answers,auto_score,score_max,requires_manual_review,submitted_at")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId),
  ]);
  if (enrolmentError || assessmentError || responseError || quizResponseError) {
    throw new Error(
      enrolmentError?.message ??
        assessmentError?.message ??
        responseError?.message ??
        quizResponseError?.message ??
        "Lecture impossible.",
    );
  }
  return {
    session,
    enrolments: (enrolments ?? []).filter((row) => activeDailyEnrolment(row.status)),
    assessments: assessments ?? [],
    feedback: responses ?? [],
    quizResponses: quizResponses ?? [],
  };
}

export async function GET(request: Request) {
  const context = await getDailyOrganisationReadContext(request, ["sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.assisted && !context.capabilities?.sessions) return NextResponse.json({ sessions: [] });
  const sessionId = new URL(request.url).searchParams.get("session_id")?.trim();
  if (!sessionId) {
    const { data, error } = await context.admin
      .from("daily_sessions")
      .select("id,internal_reference,start_date,end_date,status,daily_formations(id,title)")
      .eq("organisation_id", context.organisationId)
      .neq("status", "archived")
      .order("end_date", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sessions: data ?? [] });
  }
  try {
    const overview = await loadOverview(context.admin, context.organisationId, sessionId);
    if (!overview) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
    return NextResponse.json({ overview });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Lecture impossible." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (getAssistanceTokenFromRequest(request)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationContext(request, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const sessionId = text(body, "session_id");
  const action = text(body, "action");
  const session = sessionId ? await sessionExists(context.admin, context.organisationId, sessionId) : null;
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  if (action === "prepare") {
    const { data: enrolments, error } = await context.admin
      .from("daily_session_enrolments")
      .select("id,status")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (enrolments ?? []).filter((row) => activeDailyEnrolment(row.status)).map((row) => ({
      organisation_id: context.organisationId,
      session_id: sessionId,
      enrolment_id: row.id,
      outcome: "pending",
    }));
    if (rows.length > 0) {
      const { error: upsertError } = await context.admin.from("daily_learning_assessments").upsert(rows, { onConflict: "session_id,enrolment_id", ignoreDuplicates: true });
      if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
    await refreshChecklist(context.admin, context.organisationId, sessionId);
    return NextResponse.json({ ok: true, overview: await loadOverview(context.admin, context.organisationId, sessionId) });
  }

  if (action === "save_assessment") {
    const enrolmentId = text(body, "enrolment_id");
    const outcome = text(body, "outcome") || "pending";
    const score = nullableNumber(body.score);
    const scoreMax = nullableNumber(body.score_max);
    if (!enrolmentId || !OUTCOMES.has(outcome)) return NextResponse.json({ error: "Évaluation invalide." }, { status: 400 });
    if ((score === null) !== (scoreMax === null) || (score !== null && scoreMax !== null && (score < 0 || scoreMax <= 0 || score > scoreMax))) {
      return NextResponse.json({ error: "Le score et le score maximum doivent être cohérents." }, { status: 400 });
    }
    const { data: enrolment } = await context.admin
      .from("daily_session_enrolments")
      .select("id,status")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("id", enrolmentId)
      .maybeSingle();
    if (!enrolment || !activeDailyEnrolment(enrolment.status)) return NextResponse.json({ error: "Inscription introuvable ou inactive." }, { status: 404 });
    const now = new Date().toISOString();
    const { data, error } = await context.admin.from("daily_learning_assessments").upsert({
      organisation_id: context.organisationId,
      session_id: sessionId,
      enrolment_id: enrolmentId,
      outcome,
      score,
      score_max: scoreMax,
      method: text(body, "method") || null,
      notes: text(body, "notes") || null,
      assessed_by: outcome === "pending" ? null : context.user.id,
      assessed_at: outcome === "pending" ? null : now,
      updated_at: now,
    }, { onConflict: "session_id,enrolment_id" }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await refreshChecklist(context.admin, context.organisationId, sessionId);
    return NextResponse.json({ ok: true, assessment: data });
  }

  if (action === "create_feedback_link") {
    const enrolmentId = text(body, "enrolment_id");
    if (!enrolmentId) return NextResponse.json({ error: "Inscription requise." }, { status: 400 });
    const { data: enrolment } = await context.admin
      .from("daily_session_enrolments")
      .select("id,status")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("id", enrolmentId)
      .maybeSingle();
    if (!enrolment || !activeDailyEnrolment(enrolment.status)) return NextResponse.json({ error: "Inscription introuvable ou inactive." }, { status: 404 });
    await context.admin
      .from("daily_learner_feedback_tokens")
      .update({ status: "revoked" })
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("enrolment_id", enrolmentId)
      .eq("status", "active");
    const { token, tokenHash } = createDailyFeedbackToken();
    const base = session.end_date ? new Date(`${session.end_date}T12:00:00.000Z`) : new Date();
    base.setUTCDate(base.getUTCDate() + 30);
    const expiresAt = base.toISOString();
    const { error } = await context.admin.from("daily_learner_feedback_tokens").insert({
      organisation_id: context.organisationId,
      session_id: sessionId,
      enrolment_id: enrolmentId,
      token_hash: tokenHash,
      status: "active",
      expires_at: expiresAt,
      created_by: context.user.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, path: dailyFeedbackPath(token), expires_at: expiresAt });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
