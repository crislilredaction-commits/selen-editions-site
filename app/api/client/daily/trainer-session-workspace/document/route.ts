import {NextResponse} from "next/server";
import {getAssignedDailyTrainerSession,getDailyTrainerWorkspaceContext} from "@/lib/server/dailyTrainerWorkspaceContext";

const types=["trainer_resource","attendance_paper_evidence","learning_assessment_evidence"];
export async function GET(request:Request){
  const context=await getDailyTrainerWorkspaceContext();if(!context.ok)return NextResponse.json({error:context.error},{status:context.status});
  const params=new URL(request.url).searchParams,sessionId=params.get("session_id")??"",documentId=params.get("id")??"";
  const session=await getAssignedDailyTrainerSession(context,sessionId);if(!session)return NextResponse.json({error:"Document introuvable."},{status:404});
  const{data:document,error}=await context.admin.from("daily_documents").select("id,bucket,storage_path").eq("id",documentId).eq("organisation_id",context.orgId).eq("session_id",sessionId).eq("is_current",true).neq("status","archived").in("document_type",types).maybeSingle();
  if(error)return NextResponse.json({error:error.message},{status:500});if(!document)return NextResponse.json({error:"Document introuvable."},{status:404});
  const{data:signed,error:signedError}=await context.admin.storage.from(document.bucket).createSignedUrl(document.storage_path,120);
  if(signedError||!signed?.signedUrl)return NextResponse.json({error:"Téléchargement indisponible."},{status:500});return NextResponse.redirect(signed.signedUrl);
}
