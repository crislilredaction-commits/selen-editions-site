import {getDailyClientWorkspace} from "@/lib/server/dailyClientWorkspace";
import {getAdminSupabase} from "@/lib/server/clientNdaAccess";

const text=(value:unknown)=>String(value??"").trim();
const email=(value:unknown)=>text(value).toLowerCase();
const ids=(value:unknown)=>Array.isArray(value)?value.map(text).filter(Boolean):[];

export async function getDailyTrainerWorkspaceContext(){
  const workspace=await getDailyClientWorkspace();
  if(!workspace.ok)return workspace;
  // A shared professional address is not a personal identity. Never pick the
  // first matching profile or impersonate a trainer linked to another account.
  const eligible=workspace.workspace.trainers.filter(item=>item.active!==false&&item.status!=="archived");
  const linked=eligible.filter(item=>String(item.user_id??"")===workspace.user.id);
  const emailMatches=eligible.filter(item=>!item.user_id&&Boolean(workspace.user.email)&&email(item.professional_email)===email(workspace.user.email));
  if(linked.length>1||(!linked.length&&emailMatches.length>1))
    return{ok:false as const,status:409,error:"Plusieurs fiches formateur correspondent à votre identité. Demandez à l’organisme de corriger les rattachements."};
  const trainer=linked[0]??emailMatches[0];
  // The manager can teach under the unique owner profile of their organisation.
  // A profile assigned to another user must never be adopted through this fallback.
  let resolvedTrainer=trainer;
  if(!resolvedTrainer?.id&&workspace.workspace.membership.roles.includes("manager")){
    const owners=eligible.filter(item=>item.engagement_type==="owner"&&(!item.user_id||String(item.user_id)===workspace.user.id));
    if(owners.length===1)resolvedTrainer=owners[0];
  }
  if(!resolvedTrainer?.id)return{ok:false as const,status:403,error:"Aucun profil formateur personnel identifié. Rattachez le dirigeant à une fiche formateur."};
  return{ok:true as const,admin:getAdminSupabase(),user:workspace.user,orgId:workspace.workspace.membership.organisation_id,trainerId:String(resolvedTrainer.id),trainerName:text(resolvedTrainer.display_name||resolvedTrainer.professional_email||workspace.user.email)||"Formateur"};
}

export async function getAssignedDailyTrainerSession(context:Extract<Awaited<ReturnType<typeof getDailyTrainerWorkspaceContext>>,{ok:true}>,sessionId:string){
  const{data}=await context.admin.from("daily_sessions").select("id,organisation_id,formation_id,internal_reference,start_date,end_date,schedule_blocks,trainer_ids,daily_formations(id,title)").eq("organisation_id",context.orgId).eq("id",sessionId).maybeSingle();
  return data&&ids(data.trainer_ids).includes(context.trainerId)?data:null;
}
