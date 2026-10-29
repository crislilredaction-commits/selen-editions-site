type AdminClient = any;

type SessionRow = {
  id: string;
  formation_id: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  daily_formations?: { id?: string | null; title?: string | null } | Array<{ id?: string | null; title?: string | null }> | null;
};

function relationOne(value: SessionRow["daily_formations"]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isSessionIncluded(status: string | null | undefined, endDate: string | null | undefined, today: string) {
  return status !== "archived" && status !== "cancelled" && Boolean(endDate) && String(endDate) <= today;
}

function isActiveEnrolment(status?: string | null) {
  return status !== "cancelled" && status !== "declined" && status !== "abandoned";
}

function isAbandonedEnrolment(status?: string | null) {
  return status === "abandoned";
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

export async function loadDailyTrainingIndicators(admin: AdminClient, organisationId: string) {
  const { data: sessions, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,formation_id,start_date,end_date,status,daily_formations(id,title)")
    .eq("organisation_id", organisationId)
    .order("start_date", { ascending: false });
  if (sessionError) throw new Error(sessionError.message);

  const today = new Date().toISOString().slice(0, 10);
  const includedSessions = (sessions ?? []).filter((row: SessionRow) => isSessionIncluded(row.status, row.end_date, today));
  const sessionIds = includedSessions.map((row: SessionRow) => row.id);
  if (sessionIds.length === 0) {
    return {
      totals: {
        sessions: 0,
        learners: 0,
        abandonments: 0,
        assessments_completed: 0,
        assessment_completion_rate: 0,
        successful_assessments: 0,
        success_rate: 0,
        satisfaction_responses: 0,
        satisfaction_response_rate: 0,
        satisfaction_average: null as number | null,
        incidents: 0,
        adaptations: 0,
      },
      formations: [],
    };
  }

  const [
    { data: enrolments, error: enrolmentError },
    { data: assessments, error: assessmentError },
    { data: feedback, error: feedbackError },
    { data: followup, error: followupError },
  ] = await Promise.all([
    admin.from("daily_session_enrolments").select("id,session_id,status").eq("organisation_id", organisationId).in("session_id", sessionIds),
    admin.from("daily_learning_assessments").select("id,session_id,enrolment_id,outcome").eq("organisation_id", organisationId).in("session_id", sessionIds),
    admin.from("daily_learner_feedback_responses").select("id,session_id,enrolment_id,overall_rating").eq("organisation_id", organisationId).in("session_id", sessionIds),
    admin.from("daily_session_followup_entries").select("id,session_id,entry_type,status").eq("organisation_id", organisationId).in("session_id", sessionIds),
  ]);

  const readError = enrolmentError ?? assessmentError ?? feedbackError ?? followupError;
  if (readError) throw new Error(readError.message);

  const activeEnrolments = (enrolments ?? []).filter((row: any) => isActiveEnrolment(row.status));
  const abandonedEnrolments = (enrolments ?? []).filter((row: any) => isAbandonedEnrolment(row.status));
  const activeEnrolmentIds = new Set(activeEnrolments.map((row: any) => row.id));
  const completedAssessmentIds = new Set(
    (assessments ?? [])
      .filter((row: any) => activeEnrolmentIds.has(row.enrolment_id) && row.outcome !== "pending")
      .map((row: any) => row.enrolment_id),
  );
  const successfulAssessmentIds = new Set(
    (assessments ?? [])
      .filter((row: any) => activeEnrolmentIds.has(row.enrolment_id) && row.outcome === "achieved")
      .map((row: any) => row.enrolment_id),
  );
  const feedbackByEnrolment = new Map<string, any>();
  for (const row of feedback ?? []) {
    if (activeEnrolmentIds.has(row.enrolment_id)) feedbackByEnrolment.set(row.enrolment_id, row);
  }
  const ratings = [...feedbackByEnrolment.values()]
    .map((row: any) => Number(row.overall_rating))
    .filter((value: number) => Number.isFinite(value));
  const incidentRows = (followup ?? []).filter((row: any) => row.entry_type === "incident");
  const adaptationRows = (followup ?? []).filter((row: any) => row.entry_type === "adaptation");

  const formations = new Map<string, {
    formation_id: string;
    title: string;
    sessions: number;
    learners: number;
    abandonments: number;
    assessments_completed: number;
    successful_assessments: number;
    satisfaction_responses: number;
    rating_sum: number;
    rating_count: number;
    incidents: number;
    adaptations: number;
  }>();
  const sessionToFormation = new Map<string, string>();

  for (const session of includedSessions as SessionRow[]) {
    const relation = relationOne(session.daily_formations);
    const formationId = String(session.formation_id ?? relation?.id ?? session.id);
    const title = String(relation?.title ?? "Formation sans titre");
    sessionToFormation.set(session.id, formationId);
    const current = formations.get(formationId) ?? {
      formation_id: formationId,
      title,
      sessions: 0,
      learners: 0,
      abandonments: 0,
      assessments_completed: 0,
      successful_assessments: 0,
      satisfaction_responses: 0,
      rating_sum: 0,
      rating_count: 0,
      incidents: 0,
      adaptations: 0,
    };
    current.sessions += 1;
    formations.set(formationId, current);
  }

  for (const enrolment of activeEnrolments) {
    const formationId = sessionToFormation.get(enrolment.session_id);
    const current = formationId ? formations.get(formationId) : null;
    if (current) current.learners += 1;
  }

  for (const enrolment of abandonedEnrolments) {
    const formationId = sessionToFormation.get(enrolment.session_id);
    const current = formationId ? formations.get(formationId) : null;
    if (current) current.abandonments += 1;
  }

  const completedByFormation = new Map<string, Set<string>>();
  const successfulByFormation = new Map<string, Set<string>>();
  for (const assessment of assessments ?? []) {
    if (!activeEnrolmentIds.has(assessment.enrolment_id) || assessment.outcome === "pending") continue;
    const formationId = sessionToFormation.get(assessment.session_id);
    const current = formationId ? formations.get(formationId) : null;
    if (!formationId || !current) continue;
    const seen = completedByFormation.get(formationId) ?? new Set<string>();
    if (!seen.has(assessment.enrolment_id)) {
      seen.add(assessment.enrolment_id);
      current.assessments_completed += 1;
      completedByFormation.set(formationId, seen);
    }
    if (assessment.outcome === "achieved") {
      const successful = successfulByFormation.get(formationId) ?? new Set<string>();
      if (!successful.has(assessment.enrolment_id)) {
        successful.add(assessment.enrolment_id);
        current.successful_assessments += 1;
        successfulByFormation.set(formationId, successful);
      }
    }
  }

  for (const response of feedbackByEnrolment.values()) {
    const formationId = sessionToFormation.get(response.session_id);
    const current = formationId ? formations.get(formationId) : null;
    if (!current) continue;
    current.satisfaction_responses += 1;
    const rating = Number(response.overall_rating);
    if (Number.isFinite(rating)) {
      current.rating_sum += rating;
      current.rating_count += 1;
    }
  }
  for (const entry of followup ?? []) {
    const formationId = sessionToFormation.get(entry.session_id);
    const current = formationId ? formations.get(formationId) : null;
    if (!current) continue;
    if (entry.entry_type === "incident") current.incidents += 1;
    if (entry.entry_type === "adaptation") current.adaptations += 1;
  }

  return {
    totals: {
      sessions: includedSessions.length,
      learners: activeEnrolments.length,
      abandonments: abandonedEnrolments.length,
      assessments_completed: completedAssessmentIds.size,
      assessment_completion_rate: percent(completedAssessmentIds.size, activeEnrolments.length),
      successful_assessments: successfulAssessmentIds.size,
      success_rate: percent(successfulAssessmentIds.size, completedAssessmentIds.size),
      satisfaction_responses: feedbackByEnrolment.size,
      satisfaction_response_rate: percent(feedbackByEnrolment.size, activeEnrolments.length),
      satisfaction_average: ratings.length > 0 ? Math.round((ratings.reduce((sum: number, value: number) => sum + value, 0) / ratings.length) * 100) / 100 : null,
      incidents: incidentRows.length,
      adaptations: adaptationRows.length,
    },
    formations: [...formations.values()]
      .map((item) => ({
        formation_id: item.formation_id,
        title: item.title,
        sessions: item.sessions,
        learners: item.learners,
        abandonments: item.abandonments,
        assessments_completed: item.assessments_completed,
        assessment_completion_rate: percent(item.assessments_completed, item.learners),
        successful_assessments: item.successful_assessments,
        success_rate: percent(item.successful_assessments, item.assessments_completed),
        satisfaction_responses: item.satisfaction_responses,
        satisfaction_response_rate: percent(item.satisfaction_responses, item.learners),
        satisfaction_average: item.rating_count > 0 ? Math.round((item.rating_sum / item.rating_count) * 100) / 100 : null,
        incidents: item.incidents,
        adaptations: item.adaptations,
      }))
      .sort((a, b) => b.sessions - a.sessions || a.title.localeCompare(b.title, "fr")),
  };
}
