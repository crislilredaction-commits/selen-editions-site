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
  ] = await Promise.all([
    formationIds.length
      ? context.admin.from("daily_formations").select("id,title,global_objective,learning_objectives,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,detailed_program,detailed_program_document_url,pedagogical_methods,pedagogical_resources,evaluation_methods").in("id", formationIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? context.admin.from("daily_convention_signatures").select("id,convention_id,session_id,signatory_type,signatory_name,signatory_email,status,viewed_at,signed_at,expires_at,last_error,created_at,updated_at").in("session_id", sessionIds).order("created_at", { ascending: false }).limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (formationError || signaturesError) return NextResponse.json({ error: formationError?.message || signaturesError?.message }, { status: 500 });

  const communicationIds = (communications ?? []).map((row) => row.id);
  const { data: communicationDocuments, error: linkedDocumentsError } = communicationIds.length
    ? await context.admin.from("daily_communication_documents").select("communication_id,document_id,document_type,logical_name,document_version,created_at").in("communication_id", communicationIds)
    : { data: [], error: null };
  if (linkedDocumentsError) return NextResponse.json({ error: linkedDocumentsError.message }, { status: 500 });

  return NextResponse.json({
    sessions: sessions ?? [],
    dossiers: dossiers ?? [],
    checklist: checklist ?? [],
    formations: formations ?? [],
    communications: communications ?? [],
    communicationDocuments: communicationDocuments ?? [],
    documents: documents ?? [],
    signatures: signatures ?? [],
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
