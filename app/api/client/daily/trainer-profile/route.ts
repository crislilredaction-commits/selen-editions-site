import { NextResponse } from "next/server";
import { getDailyTrainerWorkspaceContext } from "@/lib/server/dailyTrainerWorkspaceContext";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

function clean(value:unknown){return String(value??"").trim()}
function cleanArray(value:unknown){return Array.isArray(value)?[...new Set(value.map(clean).filter(Boolean))]:[]}
function normalized(value:unknown){return clean(value).toLowerCase()}
async function ownTrainer(){
  const context=await getDailyTrainerWorkspaceContext();
  if(!context.ok)return context;
  return {...context,profile:{id:context.trainerId},organisationId:context.orgId};
}
export async function GET(req:Request){
  const delegated=await getDailyOrganisationReadContext(req,["trainers","sessions"]);
  if(delegated.ok&&delegated.assisted){
    const [{data:trainers,error:trainerError},{data:sessions,error:sessionError}]=await Promise.all([
      delegated.admin.from("daily_trainer_profiles").select("id,display_name,professional_email,status").eq("organisation_id",delegated.organisationId).neq("status","archived").order("display_name"),
      delegated.admin.from("daily_sessions").select("id,internal_reference,start_date,end_date,trainer_ids,daily_formations(title)").eq("organisation_id",delegated.organisationId).neq("status","archived").order("start_date",{ascending:false})
    ]);
    if(trainerError||sessionError)return NextResponse.json({error:trainerError?.message??sessionError?.message},{status:500});
    const sessionRows=sessions??[];
    const sessionIds=sessionRows.map(s=>s.id);
    const {data:accesses,error:accessError}=sessionIds.length
      ?await delegated.admin.from("daily_portal_access_tokens").select("id,session_id,entity_key,entity_name,entity_email,status,expires_at").eq("organisation_id",delegated.organisationId).in("session_id",sessionIds).eq("portal_type","trainer").not("status","in","(revoked,expired)")
      :{data:[],error:null};
    if(accessError)return NextResponse.json({error:accessError.message},{status:500});
    const now=Date.now();
    const choices=(trainers??[]).map(trainer=>{
      const assigned=sessionRows.filter(s=>Array.isArray(s.trainer_ids)&&s.trainer_ids.map(String).includes(String(trainer.id)));
      const portals=(accesses??[]).filter(a=>assigned.some(s=>s.id===a.session_id)&&(!a.expires_at||new Date(a.expires_at).getTime()>now)&&(a.entity_key===`trainer:${trainer.id}`||normalized(a.entity_email)===normalized(trainer.professional_email)));
      return{...trainer,sessions:assigned.map(s=>({id:s.id,internal_reference:s.internal_reference,start_date:s.start_date,end_date:s.end_date,title:Array.isArray(s.daily_formations)?s.daily_formations[0]?.title:(s.daily_formations as {title?:string|null}|null)?.title,portal_access_id:portals.find(a=>a.session_id===s.id)?.id??null}))};
    }).filter(t=>t.sessions.length>0);
    return NextResponse.json({assistance:true,trainers:choices});
  }
  const context=await ownTrainer();if(!context.ok)return NextResponse.json({error:context.error},{status:context.status});const{data,error}=await context.admin.from("daily_trainer_profiles").select("id,display_name,professional_email,phone,engagement_type,biography,specialties,status,cv_updated_at,cv_review_due_at").eq("id",context.profile.id).eq("organisation_id",context.organisationId).maybeSingle();if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({profile:data,annual_review_exempt:data?.engagement_type==="owner"})}
export async function PATCH(req:Request){const context=await ownTrainer();if(!context.ok)return NextResponse.json({error:context.error},{status:context.status});const body=await req.json().catch(()=>({}));const updates={biography:clean(body.biography)||null,specialties:cleanArray(body.specialties),professional_email:clean(body.professional_email).toLowerCase()||null,phone:clean(body.phone)||null,updated_at:new Date().toISOString()};const{data,error}=await context.admin.from("daily_trainer_profiles").update(updates).eq("id",context.profile.id).eq("organisation_id",context.organisationId).select("id,display_name,professional_email,phone,engagement_type,biography,specialties,status,cv_updated_at,cv_review_due_at").single();if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({profile:data,annual_review_exempt:data.engagement_type==="owner"})}