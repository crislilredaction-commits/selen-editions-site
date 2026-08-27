import { NextResponse } from "next/server";

import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const sessionId = String(id ?? "").trim();
  if (!sessionId) return NextResponse.json({ error: "Session requise." }, { status: 400 });

  const context = await getDailyOrganisationReadContext(request, ["sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const { data: session, error: sessionError } = await context.admin
    .from("daily_sessions")
    .select("id,formation_id,status,daily_formations(id,title,positioning_mode,learning_assessment_mode)")
    .eq("organisation_id", context.organisationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session || session.status === "archived") return NextResponse.json({ error: "Session introuvable ou archivée." }, { status: 404 });

  const [{ data: enrolments, error: enrolmentsError }, { data: documents, error: documentsError }, { data: assessmentResponses, error: responsesError }] = await Promise.all([
    context.admin
      .from("daily_session_enrolments")
      .select("id,status,positioning_status,learner_id,daily_learners(id,first_name,last_name,email)")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .not("status", "in", "(declined,cancelled)")
      .order("created_at", { ascending: true }),
    context.admin
      .from("daily_documents")
      .select("id,enrolment_id,document_type,status,logical_name,created_at")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("is_current", true)
      .in("document_type", ["positioning_evidence", "learning_assessment_evidence"])
      .order("created_at", { ascending: false }),
    context.admin
      .from("daily_learning_assessment_responses")
      .select("id,enrolment_id,submitted_at")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId),
  ]);

  const firstError = enrolmentsError ?? documentsError ?? responsesError;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  return NextResponse.json({ session, enrolments: enrolments ?? [], documents: documents ?? [], assessmentResponses: assessmentResponses ?? [] });
}
