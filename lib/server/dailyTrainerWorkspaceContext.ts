import {getDailyClientWorkspace} from "@/lib/server/dailyClientWorkspace";
import {getAdminSupabase} from "@/lib/server/clientNdaAccess";

const text=(value:unknown)=>String(value??"").trim();
const email=(value:unknown)=>text(value).toLowerCase();
const ids=(value:unknown)=>Array.isArray(value)?value.map(text).filter(Boolean):[];

export async function getDailyTrainerWorkspaceContext(){
  const workspace=await getDailyClientWorkspace();
  if(!workspace.ok)return workspace;
  const trainer=workspace.workspace.trainers.find(item=>String(item.user_id??"")===workspace.user.id)
    ??workspace.workspace.trainers.find(item=>Boolean(workspace.user.email)&&email(item.professional_email)===email(workspace.user.email));
  if(!trainer?.id)return{ok:false as const,status:403,error:"Espace réservé à un formateur identifié."};
  return{ok:true as const,admin:getAdminSupabase(),user:workspace.user,orgId:workspace.workspace.membership.organisation_id,trainerId:String(trainer.id),trainerName:text(trainer.display_name||trainer.professional_email||workspace.user.email)||"Formateur"};
}

export async function getAssignedDailyTrainerSession(context:Extract<Awaited<ReturnType<typeof getDailyTrainerWorkspaceContext>>,{ok:true}>,sessionId:string){
  const{data}=await context.admin.from("daily_sessions").select("id,organisation_id,formation_id,internal_reference,start_date,end_date,schedule_blocks,trainer_ids,daily_formations(id,title)").eq("organisation_id",context.orgId).eq("id",sessionId).maybeSingle();
  return data&&ids(data.trainer_ids).includes(context.trainerId)?data:null;
}
