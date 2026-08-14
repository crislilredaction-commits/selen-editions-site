import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import {
  buildAttendanceReportHtml,
  buildCompletionCertificateHtml,
  buildSatisfactionSummaryHtml,
  type DailyPosttrainingCommon,
} from "@/lib/server/dailyPosttrainingDocumentHtml";

const documentTypes = ["attendance_report","completion_certificate","satisfaction_summary"] as const;
type DocumentType = typeof documentTypes[number];

function text(value: unknown) { return String(value ?? "").trim(); }
function safe(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9-_]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase().slice(0,80) || "document"; }
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,"0")).join("");
}
function active(status?: string | null) { return status !== "declined" && status !== "cancelled"; }

async function generateCanonicalDocument(args: {
  admin: any;
  organisationId: string;
  userId: string;
  documentType: DocumentType;
  linkedObjectType: "session"|"enrolment";
  linkedObjectId: string;
  logicalName: string;
  filenameBase: string;
  html: string;
  metadata: Record<string,unknown>;
}) {
  const { admin, organisationId, userId, documentType, linkedObjectType, linkedObjectId, logicalName, filenameBase, html, metadata } = args;
  const { data: previousRows, error: previousError } = await admin.from("daily_documents").select("id,version,is_current").eq("organisation_id",organisationId).eq("document_type",documentType).eq("linked_object_type",linkedObjectType).eq("linked_object_id",linkedObjectId).eq("logical_name",logicalName).order("version",{ascending:false}).limit(1);
  if (previousError) throw new Error(previousError.message);
  const previous = previousRows?.[0] ?? null;
  const version = Number(previous?.version ?? 0) + 1;
  if (previous?.is_current) {
    const { error } = await admin.from("daily_documents").update({ is_current:false, updated_by:userId }).eq("id",previous.id);
    if (error) throw new Error(error.message);
  }
  const stamp = new Date().toISOString().replaceAll(":","-").replaceAll(".","-");
  const storagePath = `daily/${organisationId}/${linkedObjectType}/${linkedObjectId}/${documentType}/${safe(filenameBase)}-v${version}-${stamp}.doc`;
  const content = new Blob([html], { type:"application/msword;charset=utf-8" });
  const { error: uploadError } = await admin.storage.from("documents").upload(storagePath,content,{contentType:"application/msword;charset=utf-8",upsert:false});
  if (uploadError) throw new Error(uploadError.message);
  const hash = await sha256(html);
  const { data, error } = await admin.from("daily_documents").insert({
    organisation_id:organisationId,
    document_type:documentType,
    linked_object_type:linkedObjectType,
    linked_object_id:linkedObjectId,
    version,
    status:"to_check",
    logical_name:logicalName,
    bucket:"documents",
    storage_path:storagePath,
    mime_type:"application/msword",
    size_bytes:new TextEncoder().encode(html).byteLength,
    sha256:hash,
    created_by:userId,
    updated_by:userId,
    is_current:true,
    previous_document_id:previous?.id ?? null,
    metadata:{...metadata,generated_by:"daily_lot3d",generated_at:new Date().toISOString()},
  }).select("*").single();
  if (error) {
    await admin.storage.from("documents").remove([storagePath]);
    if (previous?.is_current) await admin.from("daily_documents").update({is_current:true,updated_by:userId}).eq("id",previous.id);
    throw new Error(error.message);
  }
  return data;
}

async function loadSession(admin:any, organisationId:string, sessionId:string) {
  const { data: session, error: sessionError } = await admin.from("daily_sessions").select("*,daily_formations(*)").eq("id",sessionId).eq("organisation_id",organisationId).maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new Error("Session introuvable.");
  const [enrolmentsResult, orgResult, slotsResult, recordsResult, assessmentsResult, feedbackResult] = await Promise.all([
    admin.from("daily_session_enrolments").select("id,learner_id,status,daily_learners(id,first_name,last_name,email)").eq("session_id",sessionId).eq("organisation_id",organisationId),
    admin.from("organisations").select("*").eq("id",organisationId).single(),
    admin.from("daily_attendance_slots").select("id,slot_date,starts_at,ends_at,label,status").eq("session_id",sessionId).eq("organisation_id",organisationId).order("slot_date",{ascending:true}).order("starts_at",{ascending:true}),
    admin.from("daily_attendance_records").select("id,slot_id,enrolment_id,status,signed_at,validated_at").eq("session_id",sessionId).eq("organisation_id",organisationId),
    admin.from("daily_learning_assessments").select("enrolment_id,outcome,score,score_max,method,assessed_at").eq("session_id",sessionId).eq("organisation_id",organisationId),
    admin.from("daily_learner_feedback_responses").select("enrolment_id,overall_rating,objectives_rating,trainer_rating,organisation_rating,content_rating,pace_rating,would_recommend,strengths,improvements,adaptation_feedback,free_comment,submitted_at").eq("session_id",sessionId).eq("organisation_id",organisationId),
  ]);
  const loadError = enrolmentsResult.error ?? orgResult.error ?? slotsResult.error ?? recordsResult.error ?? assessmentsResult.error ?? feedbackResult.error;
  if (loadError) throw new Error(loadError.message);
  return {
    session,
    org:orgResult.data,
    enrolments:(enrolmentsResult.data ?? []).filter((row:any)=>active(row.status)),
    slots:slotsResult.data ?? [],
    records:recordsResult.data ?? [],
    assessments:assessmentsResult.data ?? [],
    feedback:feedbackResult.data ?? [],
  };
}

function commonFor(session:any, org:any):DailyPosttrainingCommon {
  const formation = session.daily_formations ?? {};
  return {
    organisationName:text(org?.legal_name || org?.name),
    organisationAddress:text(org?.administrative_address),
    organisationSiret:text(org?.siret),
    organisationNda:text(org?.nda_number),
    organisationEmail:text(org?.administrative_email),
    organisationPhone:text(org?.administrative_phone),
    formationTitle:text(formation.title),
    sessionReference:text(session.internal_reference),
    startDate:text(session.start_date),
    endDate:text(session.end_date),
    modality:text(session.modality),
    location:text(session.location_address || session.remote_url),
    durationHours:text(formation.duration_hours),
    generatedAt:new Date(),
  };
}

export async function GET(req:Request) {
  const context = await getDailyOrganisationContext(req,"sessions",{allowAssistanceRead:true});
  if (!context.ok) return NextResponse.json({error:context.error},{status:context.status});
  const sessionId = new URL(req.url).searchParams.get("session_id") ?? "";
  let query = context.admin.from("daily_documents").select("*").eq("organisation_id",context.organisationId).in("document_type",[...documentTypes]).eq("is_current",true).order("created_at",{ascending:false});
  if (sessionId) {
    const { data: enrolments } = await context.admin.from("daily_session_enrolments").select("id").eq("session_id",sessionId).eq("organisation_id",context.organisationId);
    const ids = (enrolments ?? []).map((row:any)=>row.id);
    query = ids.length ? query.or(`and(linked_object_type.eq.session,linked_object_id.eq.${sessionId}),and(linked_object_type.eq.enrolment,linked_object_id.in.(${ids.join(",")}))`) : query.eq("linked_object_type","session").eq("linked_object_id",sessionId);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({documents:data ?? []});
}

export async function POST(req:Request) {
  const context = await getDailyOrganisationContext(req,"sessions");
  if (!context.ok) return NextResponse.json({error:context.error},{status:context.status});
  if (context.assisted) return NextResponse.json({error:"L’assistance agent est en lecture seule."},{status:403});
  const body = await req.json().catch(()=>({})) as Record<string,unknown>;
  const sessionId = text(body.session_id);
  if (!sessionId) return NextResponse.json({error:"Session manquante."},{status:400});
  try {
    const { session, org, enrolments, slots, records, assessments, feedback } = await loadSession(context.admin,context.organisationId,sessionId);
    if (enrolments.length === 0) throw new Error("Aucun apprenant actif dans cette session.");
    const common = commonFor(session,org);
    const learnerMap = new Map(enrolments.map((enrolment:any)=>[enrolment.id,`${text(enrolment.daily_learners?.first_name)} ${text(enrolment.daily_learners?.last_name)}`.trim()]));
    const slotMap = new Map(slots.map((slot:any)=>[slot.id,[text(slot.slot_date),text(slot.starts_at)&&text(slot.ends_at)?`${text(slot.starts_at)}-${text(slot.ends_at)}`:"",text(slot.label)].filter(Boolean).join(" ")]));
    const attendanceLines = records.filter((record:any)=>learnerMap.has(record.enrolment_id)).map((record:any)=>({
      learnerName:learnerMap.get(record.enrolment_id) || "Apprenant",
      slotLabel:slotMap.get(record.slot_id) || "Créneau",
      status:text(record.status),
      signedAt:record.signed_at,
      validatedAt:record.validated_at,
    }));
    const created:any[] = [];
    created.push(await generateCanonicalDocument({
      admin:context.admin,organisationId:context.organisationId,userId:context.user.id,documentType:"attendance_report",linkedObjectType:"session",linkedObjectId:sessionId,
      logicalName:"releve-presences",filenameBase:`releve-presences-${common.formationTitle}`,metadata:{session_id:sessionId},html:buildAttendanceReportHtml(common,attendanceLines),
    }));
    const assessmentMap = new Map(assessments.map((assessment:any)=>[assessment.enrolment_id,assessment]));
    for (const enrolment of enrolments) {
      const learnerName = learnerMap.get(enrolment.id) || "Apprenant";
      const assessment:any = assessmentMap.get(enrolment.id);
      const learnerRecords = records.filter((record:any)=>record.enrolment_id === enrolment.id);
      created.push(await generateCanonicalDocument({
        admin:context.admin,organisationId:context.organisationId,userId:context.user.id,documentType:"completion_certificate",linkedObjectType:"enrolment",linkedObjectId:enrolment.id,
        logicalName:"certificat-realisation",filenameBase:`certificat-realisation-${learnerName}`,metadata:{session_id:sessionId,enrolment_id:enrolment.id,learner_id:enrolment.learner_id,learner_name:learnerName},
        html:buildCompletionCertificateHtml(common,{learnerName,assessmentOutcome:assessment?.outcome,score:assessment?.score,scoreMax:assessment?.score_max,attendancePresent:learnerRecords.filter((record:any)=>record.status === "present").length,attendanceExpected:slots.filter((slot:any)=>slot.status !== "cancelled").length}),
      }));
    }
    created.push(await generateCanonicalDocument({
      admin:context.admin,organisationId:context.organisationId,userId:context.user.id,documentType:"satisfaction_summary",linkedObjectType:"session",linkedObjectId:sessionId,
      logicalName:"synthese-satisfaction",filenameBase:`synthese-satisfaction-${common.formationTitle}`,metadata:{session_id:sessionId,response_count:feedback.length,expected_response_count:enrolments.length},html:buildSatisfactionSummaryHtml(common,feedback,enrolments.length),
    }));
    return NextResponse.json({documents:created,count:created.length});
  } catch (cause) {
    return NextResponse.json({error:cause instanceof Error ? cause.message : "Génération impossible."},{status:400});
  }
}
