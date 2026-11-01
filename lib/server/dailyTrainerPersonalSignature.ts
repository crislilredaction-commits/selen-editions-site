import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAssignedDailyTrainerSession, getDailyTrainerWorkspaceContext } from "@/lib/server/dailyTrainerWorkspaceContext";

type Context=Extract<Awaited<ReturnType<typeof getDailyTrainerWorkspaceContext>>,{ok:true}>;
export async function recordDailyTrainerPersonalSignature(req:Request,context:Context,form:FormData){
  if(new URL(req.url).searchParams.has("assistanceToken") || req.headers.get("x-selen-agent-assistance"))return NextResponse.json({error:"La signature personnelle ne peut pas être effectuée en délégation."},{status:403});
  const sessionId=String(form.get("session_id")??""),slotId=String(form.get("slot_id")??""),image=String(form.get("signature_data")??"");
  if(form.get("signature_consent")!=="true" || !slotId || !image.startsWith("data:image/png;base64,") || image.length>1400000)return NextResponse.json({error:"Créneau, consentement et signature dessinée requis."},{status:400});
  const session=await getAssignedDailyTrainerSession(context,sessionId);if(!session)return NextResponse.json({error:"Session non affectée."},{status:403});
  const bytes=Buffer.from(image.slice("data:image/png;base64,".length),"base64");
  if(bytes.length<64 || bytes.length>1024*1024 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return NextResponse.json({error:"Image de signature invalide."},{status:400});
  const documentId=randomUUID(),hash=createHash("sha256").update(bytes).digest("hex");
  const path=`daily/${context.orgId}/trainer/${context.trainerId}/${sessionId}/trainer_signature/${documentId}.png`;
  const {error:uploadError}=await context.admin.storage.from("documents").upload(path,bytes,{contentType:"image/png",upsert:false});
  if(uploadError)return NextResponse.json({error:"Enregistrement de la preuve impossible."},{status:500});
  const {data,error}=await context.admin.rpc("daily_record_trainer_presence_signature",{p_document_id:documentId,p_organisation_id:context.orgId,p_session_id:sessionId,p_trainer_id:context.trainerId,p_actor_user_id:context.user.id,p_slot_id:slotId,p_storage_path:path,p_sha256:hash,p_size_bytes:bytes.length,p_confirmed:true,p_actor_email:context.user.email??null});
  if(error || data?.replayed)await context.admin.storage.from("documents").remove([path]);
  if(error){
    const code=String(error.code??"");
    if(code==="42501")return NextResponse.json({error:"Connectez-vous avec le compte personnel rattaché à ce formateur."},{status:403});
    if(code==="22023")return NextResponse.json({error:"Créneau ou preuve de signature invalide."},{status:400});
    if(code==="23505")return NextResponse.json({error:"Une signature existe déjà pour ce créneau."},{status:409});
    return NextResponse.json({error:"Enregistrement de la signature indisponible."},{status:500});
  }
  return NextResponse.json({ok:true,...data});
}
