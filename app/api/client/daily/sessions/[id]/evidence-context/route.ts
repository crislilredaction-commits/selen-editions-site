import { NextResponse } from "next/server";

import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";
import { filterCurrentOwnPositioningEvidence } from "@/lib/server/dailyCurrentPositioningEvidence";
import { CLIENT_VISIBLE_COMMUNICATION_STATUSES, isClientVisibleSessionDocument } from "@/lib/daily/clientEvidenceVisibility";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const sessionId = String(id ?? "").trim();
  if (!sessionId) return NextResponse.json({ error: "Session requise." }, { status: 400 });

  const context = await getDailyOrganisationReadContext(request, ["sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const { data: session, error: sessionError } = await context.admin
    .from("daily_sessions")
    .select("id,formation_id,status,daily_formations(id,organisation_id,title,positioning_mode,positioning_questionnaire_document_url,learning_assessment_mode)")
    .eq("organisation_id", context.organisationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session || session.status === "archived") return NextResponse.json({ error: "Session introuvable ou archivée." }, { status: 404 });

  const [
    { data: enrolments, error: enrolmentsError },
    { data: documents, error: documentsError },
    { data: assessmentResponses, error: responsesError },
    { data: attendanceSlots, error: slotsError },
    { data: attendanceRecords, error: recordsError },
    { data: learningAssessments, error: assessmentsError },
    { data: learnerFeedback, error: feedbackError },
    { data: communications, error: communicationsError },
  ] = await Promise.all([
    context.admin
      .from("daily_session_enrolments")
      .select("id,status,positioning_status,prerequisites_status,learner_id,daily_learners(id,first_name,last_name,email)")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
    context.admin
      .from("daily_documents")
      .select("id,formation_id,enrolment_id,document_type,status,logical_name,version,published_at,validated_at,signed_at,created_at,metadata")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("is_current", true)
      .order("created_at", { ascending: false }),
    context.admin
      .from("daily_learning_assessment_responses")
      .select("id,enrolment_id,submitted_at")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId),
    context.admin
      .from("daily_attendance_slots")
      .select("id,status")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId),
    context.admin
      .from("daily_attendance_records")
      .select("id,enrolment_id,status,signed_at,validated_at")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId),
    context.admin
      .from("daily_learning_assessments")
      .select("id,enrolment_id,outcome,score,score_max,assessed_at")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId),
    context.admin
      .from("daily_learner_feedback_responses")
      .select("id,enrolment_id,overall_rating,submitted_at")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId),
    context.admin
      .from("daily_communications")
      .select("id,enrolment_id,status,sent_at,delivered_at,failed_at,failure_reason,subject")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .in("status", [...CLIENT_VISIBLE_COMMUNICATION_STATUSES])
      .order("created_at", { ascending: false }),
  ]);

  const firstError = enrolmentsError ?? documentsError ?? responsesError ?? slotsError ?? recordsError ??
    assessmentsError ?? feedbackError ?? communicationsError;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  try {
    const currentDocuments = await filterCurrentOwnPositioningEvidence({
      admin: context.admin, organisationId: context.organisationId,
      formations: [session.daily_formations], documents: documents ?? [],
    });
    return NextResponse.json({
      session,
      enrolments: enrolments ?? [],
      documents: currentDocuments
        .filter(isClientVisibleSessionDocument)
        .map(({ metadata: _metadata, formation_id: _formationId, ...document }) => document),
      assessmentResponses: assessmentResponses ?? [],
      attendanceSlots: attendanceSlots ?? [],
      attendanceRecords: attendanceRecords ?? [],
      learningAssessments: learningAssessments ?? [],
      learnerFeedback: learnerFeedback ?? [],
      communications: communications ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Vérification de la version du positionnement indisponible." }, { status: 500 });
  }
}
