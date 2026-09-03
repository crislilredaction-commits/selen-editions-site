import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

const MAX_SIZE=10*1024*1024;
function safe(value:string){return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,90)||"document"}

export async function GET(req:Request){
 const context=await getDailyOrganisationReadContext(req,["sessions","trainings"]);if(!context.ok)return NextResponse.json({error:context.error},{status:context.status});
 const[docsR,sessionsR,enrolmentsR]=await Promise.all([
  context.admin.from("daily_documents").select("id,logical_name,status,created_at,metadata,mime_type,size_bytes").eq("organisation_id",context.organisationId).eq("document_type","organisation_shared").eq("is_current",true).neq("status","archived").order("created_at",{ascending:false}),
  context.admin.from("daily_sessions").select("id,internal_reference,start_date,daily_formations(title)").eq("organisation_id",context.organisationId).neq("status","archived").order("start_date",{ascending:false}),
  context.admin.from("daily_session_enrolments").select("id,session_id,learner_id,status,daily_learners(id,first_name,last_name,email)").eq("organisation_id",context.organisationId).not("status","in","(cancelled,declined,abandoned)"),
 ]);
 const error=docsR.error??sessionsR.error??enrolmentsR.error;if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({documents:docsR.data??[],sessions:sessionsR.data??[],enrolments:enrolmentsR.data??[]});
}

export async function POST(req:Request){
 const context=await getDailyOrganisationContext(req,"sessions");if(!context.ok)return NextResponse.json({error:context.error},{status:context.status});
 const form=await req.formData().catch(()=>null);const file=form?.get("file");const title=String(form?.get("title")??"").trim();const scope=String(form?.get("scope")??"").trim();const sessionId=String(form?.get("session_id")??"").trim()||null;let learnerIds:string[]=[];try{learnerIds=JSON.parse(String(form?.get("learner_ids")??"[]")) as string[]}catch{return NextResponse.json({error:"Sélection d'apprenants invalide."},{status:400})}
 if(!(file instanceof File)||file.size<=0)return NextResponse.json({error:"Sélectionnez un document."},{status:400});if(file.size>MAX_SIZE)return NextResponse.json({error:"Le document doit peser moins de 10 Mo."},{status:400});if(!title)return NextResponse.json({error:"Indiquez un titre pour le document."},{status:400});if(!["organisation","session","learners"].includes(scope))return NextResponse.json({error:"Portée de diffusion invalide."},{status:400});
 if(scope!=="organisation"&&!sessionId)return NextResponse.json({error:"Sélectionnez une session."},{status:400});if(scope==="learners"&&!learnerIds.length)return NextResponse.json({error:"Sélectionnez au moins un apprenant."},{status:400});
 const allowed=new Set(["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","image/jpeg","image/png","image/webp"]);if(!allowed.has(file.type))return NextResponse.json({error:"Formats acceptés : PDF, Word, JPG, PNG ou WebP."},{status:400});
 if(sessionId){const{data:session,error}=await context.admin.from("daily_sessions").select("id").eq("id",sessionId).eq("organisation_id",context.organisationId).neq("status","archived").maybeSingle();if(error||!session)return NextResponse.json({error:"Session invalide."},{status:400})}
 if(scope==="learners"){const{data:rows,error}=await context.admin.from("daily_session_enrolments").select("learner_id").eq("organisation_id",context.organisationId).eq("session_id",sessionId!).in("learner_id",learnerIds).not("status","in","(cancelled,declined,abandoned)");if(error)return NextResponse.json({error:error.message},{status:500});const valid=new Set((rows??[]).map(r=>r.learner_id));if(learnerIds.some(id=>!valid.has(id)))return NextResponse.json({error:"Un apprenant sélectionné n'appartient pas à cette session."},{status:400})}
 const bytes=Buffer.from(await file.arrayBuffer());const sha256=createHash("sha256").update(bytes).digest("hex");const storagePath=`daily/${context.organisationId}/shared/${Date.now()}-${safe(file.name)}`;const{error:uploadError}=await context.admin.storage.from("documents").upload(storagePath,bytes,{contentType:file.type,upsert:false});if(uploadError)return NextResponse.json({error:uploadError.message},{status:500});
 const metadata={distribution_scope:scope,session_id:sessionId,learner_ids:scope==="learners"?learnerIds:[],source:"organisation"};const{data,error}=await context.admin.from("daily_documents").insert({organisation_id:context.organisationId,document_type:"organisation_shared",linked_object_type:scope,linked_object_id:scope==="organisation"?context.organisationId:sessionId,version:1,status:"published",logical_name:title,bucket:"documents",storage_path:storagePath,mime_type:file.type,size_bytes:file.size,sha256,created_by:context.user.id,updated_by:context.user.id,published_at:new Date().toISOString(),is_current:true,metadata}).select("id,logical_name,status,created_at,metadata").single();if(error){await context.admin.storage.from("documents").remove([storagePath]);return NextResponse.json({error:error.message},{status:500})}return NextResponse.json({document:data},{status:201});
}

export async function DELETE(req:Request){
 const context=await getDailyOrganisationContext(req,"sessions");if(!context.ok)return NextResponse.json({error:context.error},{status:context.status});const id=new URL(req.url).searchParams.get("id")??"";if(!id)return NextResponse.json({error:"Document invalide."},{status:400});const{error}=await context.admin.from("daily_documents").update({status:"archived",is_current:false,archived_at:new Date().toISOString(),updated_by:context.user.id}).eq("id",id).eq("organisation_id",context.organisationId).eq("document_type","organisation_shared");if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({ok:true});
}
