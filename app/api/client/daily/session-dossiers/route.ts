import { NextResponse } from "next/server";
import { blockedAgentAssistanceResponse, getAssistanceTokenFromRequest } from "@/lib/server/agentAssistance";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["sessions", "trainings"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const [
    { data: sessions, error: sessionError },
    { data: dossiers, error: dossierError },
    { data: checklist, error: checklistError },
    { data: communications, error: communicationsError },
    { data: documents, error: documentsError },
  ] = await Promise.all([
    context.admin.from("daily_sessions").select("id,formation_id,internal_reference,start_date,end_date,status").eq("organisation_id", context.organisationId).neq("status", "archived").order("start_date"),
    context.admin.from("daily_session_dossiers").select("session_id,status,completed_at,updated_at").eq("organisation_id", context.organisationId),
    context.admin.from("daily_session_checklist_items").select("id,session_id,item_key,phase,responsibility,label,description,status,due_at,note,position").eq("organisation_id", context.organisationId).neq("responsibility", "selen").order("position"),
    context.admin.from("daily_communications").select("id,session_id,enrolment_id,communication_type,channel,recipient_email,recipient_name,subject,provider,status,sent_at,delivered_at,failed_at,failure_reason,created_at,metadata").eq("organisation_id", context.organisationId).not("session_id", "is", null).order("created_at", { ascending: false }).limit(500),
    context.admin.from("daily_documents").select("id,session_id,enrolment_id,document_type,status,logical_name,version,published_at,validated_at,signed_at,created_at,metadata").eq("organisation_id", context.organisationId).not("session_id", "is", null).eq("is_current", true).order("created_at", { ascending: false }).limit(500),
  ]);
  const firstError = sessionError ?? dossierError ?? checklistError ?? communicationsError ?? documentsError;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const sessionIds = (sessions ?? []).map((session) => session.id);
  const formationIds = [...new Set((sessions ?? []).map((s) => s.formation_id).filter(Boolean))];
  const [
    { data: formations, error: formationError },
    { data: signatures, error: signaturesError },
    { data: missionOrders, error: missionOrdersError },
    { data: enrolments, error: enrolmentsError },
    { data: portalAccess, error: portalAccessError },
    { data: attendanceSlots, error: attendanceSlotsError },
    { data: attendanceRecords, error: attendanceRecordsError },
    { data: assessments, error: assessmentsError },
    { data: learnerFeedback, error: learnerFeedbackError },
    { data: stakeholderFeedback, error: stakeholderFeedbackError },
  ] = await Promise.all([
    formationIds.length
      ? context.admin.from("daily_formations").select("id,title,global_objective,learning_objectives,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,detailed_program,detailed_program_document_url,pedagogical_methods,pedagogical_resources,evaluation_methods").in("id", formationIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? context.admin.from("daily_convention_signatures").select("id,convention_id,session_id,signatory_type,signatory_name,signatory_email,status,viewed_at,signed_at,expires_at,last_error,created_at,updated_at").in("session_id", sessionIds).order("created_at", { ascending: false }).limit(500)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? context.admin.from("daily_mission_orders").select("id,trainer_profile_id,trainer_user_id,trainer_name,trainer_email,order_type,start_date,end_date,session_ids,status,locked_at,created_at,updated_at").eq("organisation_id", context.organisationId).overlaps("session_ids", sessionIds).order("created_at", { ascending: false }).limit(500)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? context.admin.from("daily_session_enrolments").select("id,session_id,learner_id,status,positioning_status,prerequisites_status,created_at").eq("organisation_id", context.organisationId).in("session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? context.admin.from("daily_portal_access_tokens").select("id,session_id,portal_type,entity_key,entity_name,entity_email,status,viewed_at,expires_at,updated_at").in("session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? context.admin.from("daily_attendance_slots").select("id,session_id,slot_key,slot_date,starts_at,ends_at,mode,label,status").eq("organisation_id", context.organisationId).in("session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? context.admin.from("daily_attendance_records").select("id,session_id,enrolment_id,status,signed_at,validated_at").eq("organisation_id", context.organisationId).in("session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? context.admin.from("daily_learning_assessments").select("id,session_id,enrolment_id,outcome,score,score_max,method,assessed_at,updated_at").eq("organisation_id", context.organisationId).in("session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? context.admin.from("daily_learner_feedback_responses").select("id,session_id,enrolment_id,overall_rating,objectives_rating,submitted_at").eq("organisation_id", context.organisationId).in("session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? context.admin.from("daily_stakeholder_satisfaction_responses").select("id,session_id,stakeholder_type,entity_key,overall_rating,submitted_at").eq("organisation_id", context.organisationId).in("session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const canonicalStateError = formationError ?? signaturesError ?? missionOrdersError ?? enrolmentsError ?? portalAccessError ?? attendanceSlotsError ?? attendanceRecordsError ?? assessmentsError ?? learnerFeedbackError ?? stakeholderFeedbackError;
  if (canonicalStateError) return NextResponse.json({ error: canonicalStateError.message }, { status: 500 });

  const missionOrderIds = (missionOrders ?? []).map((order) => order.id);
  const [
    { data: missionOrderSignatures, error: missionOrderSignaturesError },
    { data: communicationDocuments, error: linkedDocumentsError },
  ] = await Promise.all([
    missionOrderIds.length
      ? context.admin.from("daily_mission_order_signatures").select("id,mission_order_id,signatory_type,user_id,signatory_name,signatory_email,signed_at,created_at").in("mission_order_id", missionOrderIds).order("created_at", { ascending: false }).limit(500)
      : Promise.resolve({ data: [], error: null }),
    (communications ?? []).length
      ? context.admin.from("daily_communication_documents").select("communication_id,document_id,document_type,logical_name,document_version,created_at").in("communication_id", (communications ?? []).map((row) => row.id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (missionOrderSignaturesError || linkedDocumentsError) return NextResponse.json({ error: missionOrderSignaturesError?.message || linkedDocumentsError?.message }, { status: 500 });

  return NextResponse.json({
    sessions: sessions ?? [],
    dossiers: dossiers ?? [],
    checklist: checklist ?? [],
    formations: formations ?? [],
    communications: communications ?? [],
    communicationDocuments: communicationDocuments ?? [],
    documents: documents ?? [],
    signatures: signatures ?? [],
    missionOrders: missionOrders ?? [],
    missionOrderSignatures: missionOrderSignatures ?? [],
    canonicalStates: {
      enrolments: enrolments ?? [],
      portalAccess: portalAccess ?? [],
      attendanceSlots: attendanceSlots ?? [],
      attendanceRecords: attendanceRecords ?? [],
      assessments: assessments ?? [],
      learnerFeedback: learnerFeedback ?? [],
      stakeholderFeedback: stakeholderFeedback ?? [],
    },
  });
}

export async function PATCH(req: Request) {
  if (getAssistanceTokenFromRequest(req)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationReadContext(req, ["sessions", "trainings"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const itemId = String(body.item_id ?? "");
  const status = String(body.status ?? "");
  const note = String(body.note ?? "").trim();
  const allowed = new Set(["todo", "in_progress", "to_review", "validated", "blocked"]);
  if (!itemId || !allowed.has(status)) return NextResponse.json({ error: "Mise à jour invalide." }, { status: 400 });
  const { data: item } = await context.admin.from("daily_session_checklist_items").select("id,responsibility").eq("id", itemId).eq("organisation_id", context.organisationId).maybeSingle();
  if (!item || !["client", "shared"].includes(item.responsibility)) return NextResponse.json({ error: "Ce point n’est pas modifiable depuis l’espace client." }, { status: 403 });
  const { data, error } = await context.admin.from("daily_session_checklist_items").update({ status, note: note || null }).eq("id", itemId).eq("organisation_id", context.organisationId).select("id,status,note").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
