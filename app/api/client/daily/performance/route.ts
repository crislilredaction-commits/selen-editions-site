import { NextResponse } from "next/server";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

type RatingRow = {
  overall_rating?: number | null;
  would_recommend?: boolean | null;
};

type AssessmentRow = {
  outcome?: string | null;
};

function average(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (usable.length === 0) return null;
  return Math.round((usable.reduce((sum, value) => sum + value, 0) / usable.length) * 100) / 100;
}

function percentage(part: number, total: number) {
  if (total <= 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

export async function GET(request: Request) {
  const context = await getDailyOrganisationReadContext(request, ["sessions", "trainings"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const [{ data: sessions, error: sessionError }, { data: learnerFeedback, error: learnerError }, { data: stakeholderFeedback, error: stakeholderError }, { data: assessments, error: assessmentError }, { data: enrolments, error: enrolmentError }] = await Promise.all([
    context.admin
      .from("daily_sessions")
      .select("id,internal_reference,start_date,end_date,status,daily_formations(title)")
      .eq("organisation_id", context.organisationId)
      .neq("status", "archived")
      .order("end_date", { ascending: false }),
    context.admin
      .from("daily_learner_feedback_responses")
      .select("session_id,overall_rating,would_recommend")
      .eq("organisation_id", context.organisationId),
    context.admin
      .from("daily_stakeholder_satisfaction_responses")
      .select("session_id,stakeholder_type,overall_rating,would_recommend")
      .eq("organisation_id", context.organisationId),
    context.admin
      .from("daily_learning_assessments")
      .select("session_id,outcome")
      .eq("organisation_id", context.organisationId),
    context.admin
      .from("daily_session_enrolments")
      .select("session_id,status")
      .eq("organisation_id", context.organisationId),
  ]);

  const error = sessionError ?? learnerError ?? stakeholderError ?? assessmentError ?? enrolmentError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const learnerRows = learnerFeedback ?? [];
  const stakeholderRows = stakeholderFeedback ?? [];
  const assessmentRows = assessments ?? [];
  const enrolmentRows = enrolments ?? [];

  const sessionMetrics = (sessions ?? []).map((session) => {
    const sessionLearnerFeedback = learnerRows.filter((row) => row.session_id === session.id) as RatingRow[];
    const sessionStakeholderFeedback = stakeholderRows.filter((row) => row.session_id === session.id) as Array<RatingRow & { stakeholder_type?: string | null }>;
    const sessionAssessments = assessmentRows.filter((row) => row.session_id === session.id) as AssessmentRow[];
    const activeEnrolments = enrolmentRows.filter((row) => row.session_id === session.id && !["cancelled", "withdrawn", "refused"].includes(String(row.status ?? "")));
    const completedAssessments = sessionAssessments.filter((row) => row.outcome && row.outcome !== "pending");
    const positiveOutcomes = completedAssessments.filter((row) => ["achieved", "partially_achieved"].includes(String(row.outcome)));
    const recommendationRows = [...sessionLearnerFeedback, ...sessionStakeholderFeedback].filter((row) => typeof row.would_recommend === "boolean");
    const recommended = recommendationRows.filter((row) => row.would_recommend === true).length;

    return {
      id: session.id,
      internal_reference: session.internal_reference,
      start_date: session.start_date,
      end_date: session.end_date,
      status: session.status,
      formation: Array.isArray(session.daily_formations) ? session.daily_formations[0]?.title ?? null : session.daily_formations?.title ?? null,
      learners: activeEnrolments.length,
      learner_feedback_count: sessionLearnerFeedback.length,
      stakeholder_feedback_count: sessionStakeholderFeedback.length,
      learner_overall_average: average(sessionLearnerFeedback.map((row) => row.overall_rating)),
      stakeholder_overall_average: average(sessionStakeholderFeedback.map((row) => row.overall_rating)),
      recommendation_rate: percentage(recommended, recommendationRows.length),
      assessment_completion_rate: percentage(completedAssessments.length, activeEnrolments.length),
      positive_outcome_rate: percentage(positiveOutcomes.length, completedAssessments.length),
    };
  });

  const allRatings: RatingRow[] = [...learnerRows, ...stakeholderRows];
  const allRecommendationRows = allRatings.filter((row) => typeof row.would_recommend === "boolean");
  const allCompletedAssessments = (assessmentRows as AssessmentRow[]).filter((row) => row.outcome && row.outcome !== "pending");
  const allPositiveOutcomes = allCompletedAssessments.filter((row) => ["achieved", "partially_achieved"].includes(String(row.outcome)));
  const activeEnrolmentCount = enrolmentRows.filter((row) => !["cancelled", "withdrawn", "refused"].includes(String(row.status ?? ""))).length;

  return NextResponse.json({
    summary: {
      sessions: sessionMetrics.length,
      learners: activeEnrolmentCount,
      satisfaction_responses: allRatings.length,
      overall_satisfaction_average: average(allRatings.map((row) => row.overall_rating)),
      recommendation_rate: percentage(allRecommendationRows.filter((row) => row.would_recommend === true).length, allRecommendationRows.length),
      assessment_completion_rate: percentage(allCompletedAssessments.length, activeEnrolmentCount),
      positive_outcome_rate: percentage(allPositiveOutcomes.length, allCompletedAssessments.length),
    },
    sessions: sessionMetrics,
  });
}
