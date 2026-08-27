import { NextResponse } from "next/server";

import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

const ACTIVE_ENROLMENT_STATUSES = new Set(["pending", "confirmed", "active", "completed"]);
const DONE_CHECKLIST_STATUSES = new Set(["validated", "not_applicable"]);

export async function GET(request: Request) {
  const context = await getDailyOrganisationReadContext(request, ["sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const [{ data: sessions, error: sessionsError }, { data: checklist, error: checklistError }, { data: enrolments, error: enrolmentsError }, { data: documents, error: documentsError }, { data: assessments, error: assessmentsError }, { data: dossiers, error: dossiersError }] = await Promise.all([
    context.admin.from("daily_sessions").select("id,formation_id").eq("organisation_id", context.organisationId).neq("status", "archived"),
    context.admin.from("daily_session_checklist_items").select("session_id,status").eq("organisation_id", context.organisationId),
    context.admin.from("daily_session_enrolments").select("id,session_id,learner_id,status,positioning_status").eq("organisation_id", context.organisationId),
    context.admin.from("daily_documents").select("session_id,enrolment_id,document_type,status,is_current").eq("organisation_id", context.organisationId).eq("is_current", true).in("document_type", ["positioning_evidence", "learning_assessment_evidence"]),
    context.admin.from("daily_learning_assessment_responses").select("session_id,enrolment_id").eq("organisation_id", context.organisationId),
    context.admin.from("daily_session_dossiers").select("session_id,status,completed_at").eq("organisation_id", context.organisationId),
  ]);

  const firstError = sessionsError ?? checklistError ?? enrolmentsError ?? documentsError ?? assessmentsError ?? dossiersError;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const checklistBySession = new Map<string, { total: number; done: number }>();
  for (const item of checklist ?? []) {
    const current = checklistBySession.get(item.session_id) ?? { total: 0, done: 0 };
    current.total += 1;
    if (DONE_CHECKLIST_STATUSES.has(item.status)) current.done += 1;
    checklistBySession.set(item.session_id, current);
  }

  const docs = documents ?? [];
  const responseKeys = new Set((assessments ?? []).map((row) => `${row.session_id}:${row.enrolment_id}`));
  const enrolmentsBySession = new Map<string, typeof enrolments>();
  for (const enrolment of enrolments ?? []) {
    if (!ACTIVE_ENROLMENT_STATUSES.has(enrolment.status)) continue;
    const current = enrolmentsBySession.get(enrolment.session_id) ?? [];
    current.push(enrolment);
    enrolmentsBySession.set(enrolment.session_id, current);
  }

  const dossierBySession = new Map((dossiers ?? []).map((row) => [row.session_id, row]));
  const completion: Record<string, { percentage: number; completed: number; expected: number; dossierStatus: string | null; completedAt: string | null }> = {};

  for (const session of sessions ?? []) {
    const checklistStats = checklistBySession.get(session.id) ?? { total: 0, done: 0 };
    const learners = enrolmentsBySession.get(session.id) ?? [];
    let expected = checklistStats.total;
    let completed = checklistStats.done;

    for (const enrolment of learners) {
      expected += 2;
      const hasPositioningEvidence = docs.some((doc) => doc.session_id === session.id && doc.enrolment_id === enrolment.id && doc.document_type === "positioning_evidence");
      const positioningDone = ["completed", "validated", "done"].includes(String(enrolment.positioning_status ?? "")) || hasPositioningEvidence;
      if (positioningDone) completed += 1;

      const hasAssessmentEvidence = docs.some((doc) => doc.session_id === session.id && doc.enrolment_id === enrolment.id && doc.document_type === "learning_assessment_evidence");
      const hasAssessmentResponse = responseKeys.has(`${session.id}:${enrolment.id}`);
      if (hasAssessmentEvidence || hasAssessmentResponse) completed += 1;
    }

    const dossier = dossierBySession.get(session.id) ?? null;
    const percentage = expected > 0 ? Math.min(100, Math.round((completed / expected) * 100)) : 0;
    completion[session.id] = {
      percentage,
      completed,
      expected,
      dossierStatus: dossier?.status ?? null,
      completedAt: dossier?.completed_at ?? null,
    };
  }

  return NextResponse.json({ completion });
}
