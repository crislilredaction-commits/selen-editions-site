import { activeDailyEnrolment } from "@/lib/server/dailyEndEvaluations";
import { ensurePosttrainingDocuments } from "@/lib/server/dailyPosttrainingDocuments";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

export async function refreshDailyEndEvaluationsChecklist(
  admin: ReturnType<typeof getAdminSupabase>,
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
  await admin.from("daily_session_checklist_items").update({ status }).eq("organisation_id", organisationId).eq("session_id", sessionId).eq("item_key", "end_evaluations").neq("status", "not_applicable");
}

export async function tryEnsureDailyPosttrainingDocuments(
  admin: ReturnType<typeof getAdminSupabase>,
  organisationId: string,
  userId: string,
  sessionId: string,
) {
  try {
    await ensurePosttrainingDocuments({ admin, organisationId, userId, sessionId });
  } catch (error) {
    console.error("[daily] automatic post-training document generation failed after end evaluation", error);
  }
}
