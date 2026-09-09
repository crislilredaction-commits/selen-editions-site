type AdminClient = any;

function isActiveEnrolment(status?: string | null) {
  return status !== "cancelled" && status !== "declined" && status !== "abandoned";
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

function signatureRows(conventions: any[]) {
  return conventions.flatMap((convention: any) => {
    const rows = Array.isArray(convention.daily_convention_signatures)
      ? convention.daily_convention_signatures
      : convention.daily_convention_signatures
        ? [convention.daily_convention_signatures]
        : [];
    return rows.map((signature: any) => ({
      id: signature.id,
      convention_id: convention.id,
      document_name: convention.document_name,
      recipient_type: convention.recipient_type,
      recipient_name: convention.recipient_name,
      recipient_email: convention.recipient_email,
      company_name: convention.company_name,
      signatory_type: signature.signatory_type,
      signatory_name: signature.signatory_name,
      signatory_email: signature.signatory_email,
      status: signature.status,
      created_at: signature.created_at,
      viewed_at: signature.viewed_at,
      signed_at: signature.signed_at,
      expires_at: signature.expires_at,
      last_error: signature.last_error,
    }));
  });
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
    { data: conventions, error: conventionsError },
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
    admin
      .from("daily_conventions")
      .select("id,document_name,recipient_type,recipient_name,recipient_email,company_name,version,generated_at,daily_convention_signatures(id,signatory_type,signatory_name,signatory_email,status,created_at,viewed_at,signed_at,expires_at,last_error)")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId)
      .order("generated_at", { ascending: true }),
  ]);

  const readError = sessionError ?? organisationError ?? enrolmentsError ?? attendanceError ?? assessmentsError ?? feedbackError ?? followupError ?? conventionsError;
  if (readError) throw new Error(readError.message);
  if (!session) throw new Error("Session introuvable.");

  const activeEnrolments = (enrolments ?? []).filter((row: any) => isActiveEnrolment(row.status));
  const activeIds = new Set(activeEnrolments.map((row: any) => row.id));
  const attendance = (attendanceRecords ?? []).filter((row: any) => activeIds.has(row.enrolment_id));
  const decidedAttendance = attendance.filter((row: any) => row.status !== "pending");
  const completedAssessments = (assessments ?? []).filter((row: any) => activeIds.has(row.enrolment_id) && row.outcome !== "pending");
  const learnerFeedback = (feedback ?? []).filter((row: any) => activeIds.has(row.enrolment_id));
  const entries = followupEntries ?? [];
  const signatures = signatureRows(conventions ?? []);
  const ratings = learnerFeedback.map((row: any) => Number(row.overall_rating)).filter((value: number) => Number.isFinite(value));
  const enrolmentNames = new Map(activeEnrolments.map((row: any) => [row.id, learnerName(row)]));

  return {
    session,
    organisation,
    enrolments: activeEnrolments.map((row: any) => ({ id: row.id, name: learnerName(row), status: row.status })),
    entries: entries.map((row: any) => ({ ...row, learner_name: row.enrolment_id ? enrolmentNames.get(row.enrolment_id) ?? null : null })),
    signatures,
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
      signatures: {
        total: signatures.length,
        pending: signatures.filter((row: any) => ["pending", "viewed", "sent"].includes(String(row.status))).length,
        viewed: signatures.filter((row: any) => row.status === "viewed").length,
        signed: signatures.filter((row: any) => row.status === "signed").length,
        expired: signatures.filter((row: any) => row.status === "expired").length,
        failed: signatures.filter((row: any) => ["failed", "error"].includes(String(row.status))).length,
        items: signatures,
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
