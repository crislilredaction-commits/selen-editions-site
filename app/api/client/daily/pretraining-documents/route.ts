import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { buildConvocationHtml, buildRegistrationPositioningHtml, buildTrainingAgreementHtml, buildTrainingProgramHtml, type DailyPretrainingCommon } from "@/lib/server/dailyPretrainingDocumentHtml";

const documentTypes = ["training_program","training_agreement","convocation","registration_positioning"] as const;
type DocumentType = typeof documentTypes[number];

function text(value: unknown) { return String(value ?? "").trim(); }
function asArray(value: unknown) { return Array.isArray(value) ? value : []; }
function scheduleText(value: unknown) {
  return asArray(value).map((entry) => {
    const row = entry && typeof entry === "object" ? entry as Record<string,unknown> : {};
    return [row.date, row.start && row.end ? `${row.start}-${row.end}` : "", row.note].map(text).filter(Boolean).join(" ");
  }).filter(Boolean).join("\n") || "Non renseigné";
}
function safe(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9-_]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase().slice(0,80) || "document"; }
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,"0")).join("");
}

async function generateCanonicalDocument(args: {
  admin: any; organisationId: string; userId: string; documentType: DocumentType; linkedObjectType: "session"|"enrolment"; linkedObjectId: string; logicalName: string; filenameBase: string; html: string; metadata: Record<string,unknown>;
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
    organisation_id:organisationId, document_type:documentType, linked_object_type:linkedObjectType, linked_object_id:linkedObjectId,
    version, status:"to_check", logical_name:logicalName, bucket:"documents", storage_path:storagePath, mime_type:"application/msword",
    size_bytes:new TextEncoder().encode(html).byteLength, sha256:hash, created_by:userId, updated_by:userId, is_current:true,
    previous_document_id:previous?.id ?? null, metadata:{...metadata,generated_by:"daily_lot2e",generated_at:new Date().toISOString()}
  }).select("*").single();
  if (error) { await admin.storage.from("documents").remove([storagePath]); throw new Error(error.message); }
  return data;
}

async function loadSession(admin:any, organisationId:string, sessionId:string) {
  const { data: session, error } = await admin.from("daily_sessions").select("*,daily_formations(*)").eq("id",sessionId).eq("organisation_id",organisationId).single();
  if (error || !session) throw new Error("Session introuvable.");
  const [{ data: enrolments, error: enrolmentError }, { data: needs, error: needsError }, { data: org, error: orgError }, { data: trainers, error: trainerError }] = await Promise.all([
    admin.from("daily_session_enrolments").select("*,daily_learners(*)").eq("session_id",sessionId).eq("organisation_id",organisationId).not("status","in",'(declined,cancelled)'),
    admin.from("daily_enrolment_support_needs").select("*").eq("organisation_id",organisationId),
    admin.from("organisations").select("*").eq("id",organisationId).single(),
    admin.from("daily_trainer_profiles").select("id,display_name").eq("organisation_id",organisationId),
  ]);
  const loadError = enrolmentError ?? needsError ?? orgError ?? trainerError;
  if (loadError) throw new Error(loadError.message);
  return { session, enrolments:enrolments ?? [], needs:needs ?? [], org, trainers:trainers ?? [] };
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
  const body = await req.json().catch(()=>({}));
  const sessionId = text(body.session_id);
  if (!sessionId) return NextResponse.json({error:"Session manquante."},{status:400});
  try {
    const { session, enrolments, needs, org, trainers } = await loadSession(context.admin,context.organisationId,sessionId);
    const formation = session.daily_formations ?? {};
    const trainerIds = asArray(session.trainer_ids).map(text);
    const trainerNames = trainers.filter((t:any)=>trainerIds.includes(t.id)).map((t:any)=>t.display_name).filter(Boolean).join(", ");
    const common:DailyPretrainingCommon = {
      organisationName:text(org?.legal_name || org?.name), organisationAddress:text(org?.administrative_address), organisationSiret:text(org?.siret), organisationNda:text(org?.nda_number),
      organisationEmail:text(org?.administrative_email), organisationPhone:text(org?.administrative_phone), formationTitle:text(formation.title), sessionReference:text(session.internal_reference),
      startDate:text(session.start_date), endDate:text(session.end_date), schedule:scheduleText(session.schedule_blocks), modality:text(session.modality), location:text(session.location_address || session.remote_url), generatedAt:new Date(),
    };
    const created:any[] = [];
    created.push(await generateCanonicalDocument({ admin:context.admin,organisationId:context.organisationId,userId:context.user.id,documentType:"training_program",linkedObjectType:"session",linkedObjectId:sessionId,logicalName:"programme-session",filenameBase:`programme-${common.formationTitle}`,metadata:{session_id:sessionId},html:buildTrainingProgramHtml(common,{globalObjective:text(formation.global_objective),learningObjectives:asArray(formation.learning_objectives),targetAudience:text(formation.target_audience),prerequisites:text(formation.prerequisites),durationHours:text(formation.duration_hours),durationDays:text(formation.duration_days),detailedProgram:text(formation.detailed_program),pedagogicalMethods:text(formation.pedagogical_methods),pedagogicalResources:text(formation.pedagogical_resources),evaluationMethods:text(formation.evaluation_methods),accessibility:text(formation.accessibility)}) }));
    const companies = asArray(session.companies) as Record<string,unknown>[];
    const company = companies[0] ?? {};
    const learnerNames = enrolments.map((e:any)=>`${text(e.daily_learners?.first_name)} ${text(e.daily_learners?.last_name)}`.trim()).filter(Boolean).join("\n");
    created.push(await generateCanonicalDocument({ admin:context.admin,organisationId:context.organisationId,userId:context.user.id,documentType:"training_agreement",linkedObjectType:"session",linkedObjectId:sessionId,logicalName:"convention-session",filenameBase:`convention-${common.formationTitle}`,metadata:{session_id:sessionId,company_name:text(company.name)},html:buildTrainingAgreementHtml(common,{clientName:text(company.name || enrolments[0]?.company_name),clientAddress:text(company.address),clientSiret:text(company.siret),representative:text(company.contact_name || enrolments[0]?.company_contact_name),learnerNames,price:text(formation.price),objective:text(formation.global_objective),prerequisites:text(formation.prerequisites),evaluation:text(formation.evaluation_methods)}) }));
    const needsMap = new Map(needs.map((n:any)=>[n.enrolment_id,n]));
    for (const enrolment of enrolments) {
      const learner = enrolment.daily_learners ?? {};
      const learnerName = `${text(learner.first_name)} ${text(learner.last_name)}`.trim();
      const need:any = needsMap.get(enrolment.id);
      created.push(await generateCanonicalDocument({admin:context.admin,organisationId:context.organisationId,userId:context.user.id,documentType:"convocation",linkedObjectType:"enrolment",linkedObjectId:enrolment.id,logicalName:"convocation-apprenant",filenameBase:`convocation-${learnerName}`,metadata:{session_id:sessionId,enrolment_id:enrolment.id,learner_id:enrolment.learner_id,learner_name:learnerName},html:buildConvocationHtml(common,{learnerName,learnerEmail:text(learner.email),trainerNames,usefulInfo:need?.planned_accommodations ? `Adaptation prévue : ${text(need.planned_accommodations)}` : ""})}));
      created.push(await generateCanonicalDocument({admin:context.admin,organisationId:context.organisationId,userId:context.user.id,documentType:"registration_positioning",linkedObjectType:"enrolment",linkedObjectId:enrolment.id,logicalName:"inscription-positionnement",filenameBase:`inscription-positionnement-${learnerName}`,metadata:{session_id:sessionId,enrolment_id:enrolment.id,learner_id:enrolment.learner_id,learner_name:learnerName},html:buildRegistrationPositioningHtml(common,{learnerName,learnerEmail:text(learner.email),companyName:text(enrolment.company_name || learner.company_name),funding:[text(enrolment.funding_type),text(enrolment.funding_organisation)].filter(Boolean).join(" · "),prerequisites:text(formation.prerequisites),positioningStatus:text(enrolment.positioning_status),prerequisiteStatus:text(enrolment.prerequisites_status),supportNeeds:need?.has_specific_needs ? [text(need.needs_description),text(need.planned_accommodations)].filter(Boolean).join("\n") : ""})}));
    }
    return NextResponse.json({documents:created,count:created.length});
  } catch (cause) {
    return NextResponse.json({error:cause instanceof Error ? cause.message : "Génération impossible."},{status:400});
  }
}
