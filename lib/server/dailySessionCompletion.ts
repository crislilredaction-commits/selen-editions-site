export const ACTIVE_ENROLMENT_STATUSES = new Set(["pending", "confirmed", "active", "completed"]);
export const DONE_CHECKLIST_STATUSES = new Set(["validated", "not_applicable"]);
export const DONE_POSITIONING_STATUSES = new Set(["reviewed", "completed", "validated", "done"]);

type CompletionStats = {
  percentage: number;
  completed: number;
  expected: number;
};

type DossierState = {
  status?: string | null;
  completed_at?: string | null;
} | null;

export function calculateDailySessionCompletion(args: {
  sessionId: string;
  checklist: any[];
  enrolments: any[];
  documents: any[];
  assessmentResponses: any[];
  recordedAssessments: any[];
}): CompletionStats {
  const { sessionId, checklist, enrolments, documents, assessmentResponses, recordedAssessments } = args;
  const sessionChecklist = checklist.filter(
    (item) => item.session_id === sessionId && item.responsibility !== "selen",
  );
  const learners = enrolments.filter(
    (enrolment) => enrolment.session_id === sessionId && ACTIVE_ENROLMENT_STATUSES.has(enrolment.status),
  );
  const sessionDocuments = documents.filter((document) => document.session_id === sessionId);
  const responseKeys = new Set(
    assessmentResponses
      .filter((row) => row.session_id === sessionId)
      .map((row) => `${row.session_id}:${row.enrolment_id}`),
  );
  const recordedAssessmentKeys = new Set(
    recordedAssessments
      .filter((row) => row.session_id === sessionId && row.outcome && row.outcome !== "pending")
      .map((row) => `${row.session_id}:${row.enrolment_id}`),
  );

  let expected = sessionChecklist.length;
  let completed = sessionChecklist.filter((item) => DONE_CHECKLIST_STATUSES.has(item.status)).length;

  for (const enrolment of learners) {
    expected += 2;
    const hasPositioningEvidence = sessionDocuments.some(
      (document) => document.enrolment_id === enrolment.id && document.document_type === "positioning_evidence",
    );
    if (DONE_POSITIONING_STATUSES.has(String(enrolment.positioning_status ?? "")) || hasPositioningEvidence) {
      completed += 1;
    }

    const assessmentKey = `${sessionId}:${enrolment.id}`;
    const hasAssessmentEvidence = sessionDocuments.some(
      (document) => document.enrolment_id === enrolment.id && document.document_type === "learning_assessment_evidence",
    );
    const hasAssessmentResponse = responseKeys.has(assessmentKey);
    const hasRecordedAssessment = recordedAssessmentKeys.has(assessmentKey);
    if (hasAssessmentEvidence || hasAssessmentResponse || hasRecordedAssessment) completed += 1;
  }

  return {
    percentage: expected > 0 ? Math.min(100, Math.round((completed / expected) * 100)) : 0,
    completed,
    expected,
  };
}

export function isDailySessionReadyToClose(endDate: string | null | undefined, stats: CompletionStats, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return Boolean(endDate && endDate <= today && stats.expected > 0 && stats.completed === stats.expected);
}

export async function closeDailySessionDossierIfReady(args: {
  admin: any;
  organisationId: string;
  sessionId: string;
  endDate?: string | null;
  stats: CompletionStats;
  dossier: DossierState;
  now?: Date;
}) {
  const { admin, organisationId, sessionId, endDate, stats, dossier, now = new Date() } = args;
  const currentStatus = dossier?.status ?? null;
  const currentCompletedAt = dossier?.completed_at ?? null;

  if (!isDailySessionReadyToClose(endDate, stats, now) || currentStatus !== "active") {
    return {
      ...stats,
      dossierStatus: currentStatus,
      completedAt: currentCompletedAt,
      closed: false,
    };
  }

  const stamp = now.toISOString();
  const { data, error } = await admin
    .from("daily_session_dossiers")
    .update({ status: "completed", completed_at: stamp, updated_at: stamp })
    .eq("organisation_id", organisationId)
    .eq("session_id", sessionId)
    .eq("status", "active")
    .select("status,completed_at")
    .maybeSingle();
  if (error) throw new Error(error.message);

  return {
    ...stats,
    dossierStatus: data?.status ?? currentStatus,
    completedAt: data?.completed_at ?? currentCompletedAt,
    closed: Boolean(data),
  };
}

export async function reconcileDailySessionDossier(args: {
  admin: any;
  organisationId: string;
  sessionId: string;
  now?: Date;
}) {
  const { admin, organisationId, sessionId, now = new Date() } = args;
  const [
    { data: session, error: sessionError },
    { data: checklist, error: checklistError },
    { data: enrolments, error: enrolmentsError },
    { data: documents, error: documentsError },
    { data: assessmentResponses, error: assessmentResponsesError },
    { data: recordedAssessments, error: recordedAssessmentsError },
    { data: dossier, error: dossierError },
  ] = await Promise.all([
    admin.from("daily_sessions").select("id,end_date,status").eq("id", sessionId).eq("organisation_id", organisationId).neq("status", "archived").maybeSingle(),
    admin.from("daily_session_checklist_items").select("session_id,status,responsibility").eq("session_id", sessionId).eq("organisation_id", organisationId).neq("responsibility", "selen"),
    admin.from("daily_session_enrolments").select("id,session_id,status,positioning_status").eq("session_id", sessionId).eq("organisation_id", organisationId),
    admin.from("daily_documents").select("session_id,enrolment_id,document_type,status,is_current").eq("session_id", sessionId).eq("organisation_id", organisationId).eq("is_current", true).in("document_type", ["positioning_evidence", "learning_assessment_evidence"]),
    admin.from("daily_learning_assessment_responses").select("session_id,enrolment_id").eq("session_id", sessionId).eq("organisation_id", organisationId),
    admin.from("daily_learning_assessments").select("session_id,enrolment_id,outcome").eq("session_id", sessionId).eq("organisation_id", organisationId),
    admin.from("daily_session_dossiers").select("session_id,status,completed_at").eq("session_id", sessionId).eq("organisation_id", organisationId).maybeSingle(),
  ]);

  const firstError = sessionError ?? checklistError ?? enrolmentsError ?? documentsError ?? assessmentResponsesError ?? recordedAssessmentsError ?? dossierError;
  if (firstError) throw new Error(firstError.message);
  if (!session) return null;

  const stats = calculateDailySessionCompletion({
    sessionId,
    checklist: checklist ?? [],
    enrolments: enrolments ?? [],
    documents: documents ?? [],
    assessmentResponses: assessmentResponses ?? [],
    recordedAssessments: recordedAssessments ?? [],
  });

  return closeDailySessionDossierIfReady({
    admin,
    organisationId,
    sessionId,
    endDate: session.end_date,
    stats,
    dossier,
    now,
  });
}
