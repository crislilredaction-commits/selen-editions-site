type AdminClient = any;

function isActiveEnrolment(status?: string | null) {
  return status !== "cancelled" && status !== "declined";
}

function learnerFrom(value: unknown) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function learnerName(enrolment: any) {
  const learner = learnerFrom(enrolment?.daily_learners);
  if (!learner) return "Apprenant";
  const name = [learner.first_name, learner.last_name].filter(Boolean).join(" ").trim();
  return name || String(learner.email ?? "").trim() || "Apprenant";
}

export async function loadDailySessionFollowupSnapshot(admin: AdminClient, organisationId: string, sessionId: string) {
  const [
    { data: session, error: sessionError },
    { data: organisation, error: organisationError },
    { data: enrolments, error: enrolmentsError },
    { data: attendanceRecords, error: attendanceError },
    { data: assessments, error: assessmentsError },
    { data: feedback, error: feedbackError },
    { data: followupEntries, error: followupError },
  ] = await Promise.all([
    admin
      .from("daily_sessions")
      .select("id,internal_reference,start_date,end_date,status,daily_formations(id,title)")
      .eq("organisation_id", organisationId)
      .eq("id", sessionId)
      .maybeSingle(),
    admin
      .from("organisations")
      .select("id,name,legal_name,siret,nda_number")
      .eq("id", organisationId)
      .maybeSingle(),
    admin
      .from("daily_session_enrolments")
      .select("id,status,daily_learners(id,first_name,last_name,email)")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId),
    admin
      .from("daily_attendance_records")
      .select("id,enrolment_id,status")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId),
    admin
      .from("daily_learning_assessments")
      .select("id,enrolment_id,outcome")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId),
    admin
      .from("daily_learner_feedback_responses")
      .select("id,enrolment_id,overall_rating")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId),
    admin
      .from("daily_session_followup_entries")
      .select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,author_role,author_name")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId)
      .order("occurred_at", { ascending: true }),
  ]);

  const readError = sessionError ?? organisationError ?? enrolmentsError ?? attendanceError ?? assessmentsError ?? feedbackError ?? followupError;
  if (readError) throw new Error(readError.message);
  if (!session) throw new Error("Session introuvable.");

  const activeEnrolments = (enrolments ?? []).filter((row: any) => isActiveEnrolment(row.status));
  const activeIds = new Set(activeEnrolments.map((row: any) => row.id));
  const attendance = (attendanceRecords ?? []).filter((row: any) => activeIds.has(row.enrolment_id));
  const decidedAttendance = attendance.filter((row: any) => row.status !== "pending");
  const completedAssessments = (assessments ?? []).filter((row: any) => activeIds.has(row.enrolment_id) && row.outcome !== "pending");
  const learnerFeedback = (feedback ?? []).filter((row: any) => activeIds.has(row.enrolment_id));
  const entries = followupEntries ?? [];
  const ratings = learnerFeedback.map((row: any) => Number(row.overall_rating)).filter((value: number) => Number.isFinite(value));
  const enrolmentNames = new Map(activeEnrolments.map((row: any) => [row.id, learnerName(row)]));

  return {
    session,
    organisation,
    enrolments: activeEnrolments.map((row: any) => ({ id: row.id, name: learnerName(row), status: row.status })),
    entries: entries.map((row: any) => ({ ...row, learner_name: row.enrolment_id ? enrolmentNames.get(row.enrolment_id) ?? null : null })),
    summary: {
      session,
      learners: { active: activeEnrolments.length },
      attendance: { decided: decidedAttendance.length, total: attendance.length },
      assessments: { completed: completedAssessments.length, expected: activeEnrolments.length },
      satisfaction: {
        responses: learnerFeedback.length,
        expected: activeEnrolments.length,
        average_rating: ratings.length > 0 ? ratings.reduce((sum: number, value: number) => sum + value, 0) / ratings.length : null,
      },
      followup: {
        open: entries.filter((row: any) => row.status === "open").length,
        resolved: entries.filter((row: any) => row.status === "resolved").length,
        incidents: entries.filter((row: any) => row.entry_type === "incident").length,
        adaptations: entries.filter((row: any) => row.entry_type === "adaptation").length,
      },
    },
  };
}
