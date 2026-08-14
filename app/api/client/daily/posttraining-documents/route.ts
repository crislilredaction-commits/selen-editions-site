import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { buildAttendanceSummaryHtml, buildCompletionCertificateHtml } from "@/lib/server/dailyPosttrainingDocumentHtml";

const documentTypes = ["attendance_summary","completion_certificate"] as const;
type DocumentType = typeof documentTypes[number];

function text(value: unknown) { return String(value ?? "").trim(); }
function safe(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9-_]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase().slice(0,80) || "document"; }
function learnerFrom(value: unknown) { return Array.isArray(value) ? value[0] ?? {} : value && typeof value === "object" ? value : {}; }
function learnerName(enrolment: any) { const learner:any=learnerFrom(enrolment.daily_learners); return `${text(learner.first_name)} ${text(learner.last_name)}`.trim() || text(learner.email) || "Apprenant"; }
function durationHours(start: unknown,end: unknown) { const [sh,sm]=text(start).slice(0,5).split(":").map(Number); const [eh,em]=text(end).slice(0,5).split(":").map(Number); if (![sh,sm,eh,em].every(Number.isFinite)) return 0; return Math.max(0,((eh*60+em)-(sh*60+sm))/60); }
async function sha256(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,"0")).join("");}

async function generate(args:{admin:any;organisationId:string;userId:string;documentType:DocumentType;linkedObjectType:"session"|"enrolment";linkedObjectId:string;logicalName:string;filenameBase:string;html:string;metadata:Record<string,unknown>}) {
  const {admin,organisationId,userId,documentType,linkedObjectType,linkedObjectId,logicalName,filenameBase,html,metadata}=args;
  const {data:rows,error:readError}=await admin.from("daily_documents").select("id,version,is_current").eq("organisation_id",organisationId).eq("document_type",documentType).eq("linked_object_type",linkedObjectType).eq("linked_object_id",linkedObjectId).eq("logical_name",logicalName).order("version",{ascending:false}).limit(1);
  if(readError)throw new Error(readError.message); const previous=rows?.[0]??null; const version=Number(previous?.version??0)+1;
  if(previous?.is_current){const {error}=await admin.from("daily_documents").update({is_current:false,updated_by:userId}).eq("id",previous.id);if(error)throw new Error(error.message);}
  const stamp=new Date().toISOString().replaceAll(":","-").replaceAll(".","-"); const storagePath=`daily/${organisationId}/${linkedObjectType}/${linkedObjectId}/${documentType}/${safe(filenameBase)}-v${version}-${stamp}.doc`;
  const blob=new Blob([html],{type:"application/msword;charset=utf-8"}); const {error:uploadError}=await admin.storage.from("documents").upload(storagePath,blob,{contentType:"application/msword;charset=utf-8",upsert:false}); if(uploadError)throw new Error(uploadError.message);
  const {data,error}=await admin.from("daily_documents").insert({organisation_id:organisationId,document_type:documentType,linked_object_type:linkedObjectType,linked_object_id:linkedObjectId,version,status:"to_check",logical_name:logicalName,bucket:"documents",storage_path:storagePath,mime_type:"application/msword",size_bytes:new TextEncoder().encode(html).byteLength,sha256:await sha256(html),created_by:userId,updated_by:userId,is_current:true,previous_document_id:previous?.id??null,metadata:{...metadata,generated_by:"daily_lot3d",generated_at:new Date().toISOString()}}).select("*").single();
  if(error){await admin.storage.from("documents").remove([storagePath]);throw new Error(error.message);} return data;
}

async function load(admin:any,organisationId:string,sessionId:string){
  const [{data:session,error:sessionError},{data:enrolments,error:enrolmentError},{data:slots,error:slotError},{data:records,error:recordError},{data:org,error:orgError}]=await Promise.all([
    admin.from("daily_sessions").select("id,organisation_id,internal_reference,start_date,end_date,status,daily_formations(id,title)").eq("id",sessionId).eq("organisation_id",organisationId).maybeSingle(),
    admin.from("daily_session_enrolments").select("id,status,learner_id,daily_learners(id,first_name,last_name,email)").eq("session_id",sessionId).eq("organisation_id",organisationId).not("status","in",'(declined,cancelled)'),
    admin.from("daily_attendance_slots").select("id,slot_date,starts_at,ends_at,status").eq("session_id",sessionId).eq("organisation_id",organisationId).neq("status","cancelled").order("slot_date").order("starts_at"),
    admin.from("daily_attendance_records").select("id,slot_id,enrolment_id,status,proof_sha256,signed_at").eq("session_id",sessionId).eq("organisation_id",organisationId),
    admin.from("organisations").select("id,name,legal_name,siret,nda_number").eq("id",organisationId).maybeSingle(),
  ]);
  const error=sessionError??enrolmentError??slotError??recordError??orgError;if(error)throw new Error(error.message);if(!session)throw new Error("Session introuvable.");return{session,enrolments:enrolments??[],slots:slots??[],records:records??[],org};
}

async function syncChecklist(admin:any,organisationId:string,sessionId:string,expected:number){
  const {data:docs}=await admin.from("daily_documents").select("id,status").eq("organisation_id",organisationId).in("document_type",[...documentTypes]).eq("is_current",true).contains("metadata",{session_id:sessionId});
  const current=docs??[]; const allPresent=expected>0&&current.length>=expected; const allValidated=allPresent&&current.every((doc:any)=>doc.status==="validated"); const status=allValidated?"validated":allPresent?"to_review":current.length?"in_progress":"todo";
  await admin.from("daily_session_checklist_items").update({status}).eq("organisation_id",organisationId).eq("session_id",sessionId).eq("item_key","posttraining_documents").neq("status","not_applicable");
}

export async function GET(req:Request){
  const context=await getDailyOrganisationContext(req,"sessions",{allowAssistanceRead:true});if(!context.ok)return NextResponse.json({error:context.error},{status:context.status}); const sessionId=new URL(req.url).searchParams.get("session_id")??"";
  let query=context.admin.from("daily_documents").select("*").eq("organisation_id",context.organisationId).in("document_type",[...documentTypes]).eq("is_current",true).order("created_at",{ascending:false}); if(sessionId)query=query.contains("metadata",{session_id:sessionId}); const {data,error}=await query;if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({documents:data??[]});
}

export async function POST(req:Request){
  const context=await getDailyOrganisationContext(req,"sessions");if(!context.ok)return NextResponse.json({error:context.error},{status:context.status});if(context.assisted)return NextResponse.json({error:"L’assistance agent est en lecture seule."},{status:403});const body=await req.json().catch(()=>({}));const sessionId=text(body.session_id);if(!sessionId)return NextResponse.json({error:"Session manquante."},{status:400});
  try{
    const {session,enrolments,slots,records,org}=await load(context.admin,context.organisationId,sessionId);
    if(slots.length===0)return NextResponse.json({error:"Aucun créneau de présence n’est disponible pour établir les documents de fin."},{status:400});
    if(enrolments.length===0)return NextResponse.json({error:"Aucun apprenant actif n’est inscrit à cette session."},{status:400});

    const formation=Array.isArray(session.daily_formations)?session.daily_formations[0]:session.daily_formations;
    const title=text(formation?.title)||"Formation";
    const orgName=text(org?.legal_name||org?.name)||"Organisme de formation";
    const recordMap=new Map(records.map((r:any)=>[`${r.slot_id}:${r.enrolment_id}`,r]));
    const expectedAttendance=enrolments.length*slots.length;
    let settledAttendance=0;
    for(const enrolment of enrolments){
      for(const slot of slots){
        const record:any=recordMap.get(`${slot.id}:${enrolment.id}`);
        if(record&&record.status!=="pending")settledAttendance++;
      }
    }
    if(settledAttendance<expectedAttendance){
      return NextResponse.json({error:`Finalisez les présences avant de générer les documents de fin (${settledAttendance}/${expectedAttendance}).`},{status:409});
    }

    const lines:any[]=[];
    for(const enrolment of enrolments){
      for(const slot of slots){
        const record:any=recordMap.get(`${slot.id}:${enrolment.id}`);
        lines.push({learnerName:learnerName(enrolment),date:text(slot.slot_date),start:text(slot.starts_at).slice(0,5),end:text(slot.ends_at).slice(0,5),status:text(record?.status),proofHash:record?.proof_sha256??null});
      }
    }

    const created:any[]=[];
    created.push(await generate({admin:context.admin,organisationId:context.organisationId,userId:context.user.id,documentType:"attendance_summary",linkedObjectType:"session",linkedObjectId:sessionId,logicalName:"releve-presences",filenameBase:`releve-presences-${title}`,metadata:{session_id:sessionId},html:buildAttendanceSummaryHtml({organisationName:orgName,formationTitle:title,sessionReference:text(session.internal_reference),startDate:text(session.start_date),endDate:text(session.end_date),lines,generatedAt:new Date()})}));

    const plannedHours=slots.reduce((sum:number,slot:any)=>sum+durationHours(slot.starts_at,slot.ends_at),0);
    let eligible=0;
    for(const enrolment of enrolments){
      const learnerRecords=slots.map((slot:any)=>({slot,record:recordMap.get(`${slot.id}:${enrolment.id}`) as any}));
      const attendedHours=learnerRecords.filter(({record})=>record?.status==="present").reduce((sum,{slot})=>sum+durationHours(slot.starts_at,slot.ends_at),0);
      if(attendedHours<=0)continue;
      eligible++;
      created.push(await generate({admin:context.admin,organisationId:context.organisationId,userId:context.user.id,documentType:"completion_certificate",linkedObjectType:"enrolment",linkedObjectId:enrolment.id,logicalName:"certificat-realisation",filenameBase:`certificat-realisation-${learnerName(enrolment)}`,metadata:{session_id:sessionId,enrolment_id:enrolment.id,learner_id:enrolment.learner_id,learner_name:learnerName(enrolment),planned_hours:plannedHours,attended_hours:attendedHours},html:buildCompletionCertificateHtml({organisationName:orgName,organisationSiret:text(org?.siret),organisationNda:text(org?.nda_number),formationTitle:title,learnerName:learnerName(enrolment),startDate:text(session.start_date),endDate:text(session.end_date),plannedHours,attendedHours,generatedAt:new Date()})}));
    }
    await syncChecklist(context.admin,context.organisationId,sessionId,1+eligible);
    return NextResponse.json({documents:created,count:created.length,eligibleCertificates:eligible});
  }catch(cause){return NextResponse.json({error:cause instanceof Error?cause.message:"Génération impossible."},{status:400});}
}
