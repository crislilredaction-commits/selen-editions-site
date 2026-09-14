import { NextResponse } from "next/server";

import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";
import {
  calculateDailySessionCompletion,
  closeDailySessionDossierIfReady,
} from "@/lib/server/dailySessionCompletion";

export async function GET(request: Request) {
  const context = await getDailyOrganisationReadContext(request, ["sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const [{ data: sessions, error: sessionsError }, { data: checklist, error: checklistError }, { data: enrolments, error: enrolmentsError }, { data: documents, error: documentsError }, { data: assessments, error: assessmentsError }, { data: recordedAssessments, error: recordedAssessmentsError }, { data: dossiers, error: dossiersError }] = await Promise.all([
    context.admin.from("daily_sessions").select("id,formation_id,end_date").eq("organisation_id", context.organisationId).neq("status", "archived"),
    context.admin.from("daily_session_checklist_items").select("session_id,status,responsibility").eq("organisation_id", context.organisationId).neq("responsibility", "selen"),
    context.admin.from("daily_session_enrolments").select("id,session_id,learner_id,status,positioning_status").eq("organisation_id", context.organisationId),
    context.admin.from("daily_documents").select("session_id,enrolment_id,document_type,status,is_current").eq("organisation_id", context.organisationId).eq("is_current", true).in("document_type", ["positioning_evidence", "learning_assessment_evidence"]),
    context.admin.from("daily_learning_assessment_responses").select("session_id,enrolment_id").eq("organisation_id", context.organisationId),
    context.admin.from("daily_learning_assessments").select("session_id,enrolment_id,outcome").eq("organisation_id", context.organisationId),
    context.admin.from("daily_session_dossiers").select("session_id,status,completed_at").eq("organisation_id", context.organisationId),
  ]);

  const firstError = sessionsError ?? checklistError ?? enrolmentsError ?? documentsError ?? assessmentsError ?? recordedAssessmentsError ?? dossiersError;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const dossierBySession = new Map((dossiers ?? []).map((row) => [row.session_id, row]));
  const completion: Record<string, { percentage: number; completed: number; expected: number; dossierStatus: string | null; completedAt: string | null }> = {};

  try {
    for (const session of sessions ?? []) {
      const stats = calculateDailySessionCompletion({
        sessionId: session.id,
        checklist: checklist ?? [],
        enrolments: enrolments ?? [],
        documents: documents ?? [],
        assessmentResponses: assessments ?? [],
        recordedAssessments: recordedAssessments ?? [],
      });
      const reconciled = await closeDailySessionDossierIfReady({
        admin: context.admin,
        organisationId: context.organisationId,
        sessionId: session.id,
        endDate: session.end_date,
        stats,
        dossier: dossierBySession.get(session.id) ?? null,
      });
      completion[session.id] = {
        percentage: reconciled.percentage,
        completed: reconciled.completed,
        expected: reconciled.expected,
        dossierStatus: reconciled.dossierStatus,
        completedAt: reconciled.completedAt,
      };
    }
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Impossible de finaliser la complétude des sessions." }, { status: 500 });
  }

  return NextResponse.json({ completion });
}
