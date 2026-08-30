import { NextResponse } from "next/server";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

function isActiveEnrolment(status?: string | null) {
  return status !== "cancelled" && status !== "declined";
}

export async function GET(request: Request) {
  const context = await getDailyOrganisationReadContext(request, ["sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.assisted && !context.capabilities?.sessions) return NextResponse.json({ summary: null });

  const sessionId = new URL(request.url).searchParams.get("session_id")?.trim();
  if (!sessionId) return NextResponse.json({ error: "Session requise." }, { status: 400 });

  const { data: session, error: sessionError } = await context.admin
    .from("daily_sessions")
    .select("id,internal_reference,start_date,end_date,status,daily_formations(id,title)")
    .eq("organisation_id", context.organisationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  const [
    { data: enrolments, error: enrolmentsError },
    { data: attendanceRecords, error: attendanceError },
    { data: assessments, error: assessmentsError },
    { data: feedback, error: feedbackError },
    { data: followupEntries, error: followupError },
  ] = await Promise.all([
    context.admin
      .from("daily_session_enrolments")
      .select("id,status")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId),
    context.admin
      .from("daily_attendance_records")
      .select("id,enrolment_id,status")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId),
    context.admin
      .from("daily_learning_assessments")
      .select("id,enrolment_id,outcome")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId),
    context.admin
      .from("daily_learner_feedback_responses")
      .select("id,enrolment_id,overall_rating")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId),
    context.admin
      .from("daily_session_followup_entries")
      .select("id,status,entry_type")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId),
  ]);

  const readError = enrolmentsError ?? attendanceError ?? assessmentsError ?? feedbackError ?? followupError;
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const activeEnrolments = (enrolments ?? []).filter((row) => isActiveEnrolment(row.status));
  const activeIds = new Set(activeEnrolments.map((row) => row.id));
  const attendance = (attendanceRecords ?? []).filter((row) => activeIds.has(row.enrolment_id));
  const decidedAttendance = attendance.filter((row) => row.status !== "pending");
  const completedAssessments = (assessments ?? []).filter((row) => activeIds.has(row.enrolment_id) && row.outcome !== "pending");
  const learnerFeedback = (feedback ?? []).filter((row) => activeIds.has(row.enrolment_id));
  const entries = followupEntries ?? [];
  const ratings = learnerFeedback
    .map((row) => Number(row.overall_rating))
    .filter((value) => Number.isFinite(value));

  return NextResponse.json({
    summary: {
      session,
      learners: {
        active: activeEnrolments.length,
      },
      attendance: {
        decided: decidedAttendance.length,
        total: attendance.length,
      },
      assessments: {
        completed: completedAssessments.length,
        expected: activeEnrolments.length,
      },
      satisfaction: {
        responses: learnerFeedback.length,
        expected: activeEnrolments.length,
        average_rating: ratings.length > 0 ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null,
      },
      followup: {
        open: entries.filter((row) => row.status === "open").length,
        resolved: entries.filter((row) => row.status === "resolved").length,
        incidents: entries.filter((row) => row.entry_type === "incident").length,
        adaptations: entries.filter((row) => row.entry_type === "adaptation").length,
      },
    },
  });
}
