import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params={params:Promise<{token:string}>};
type Json=Record<string,unknown>;
const INACTIVE=new Set(["declined","cancelled","abandoned"]);
const text=(v:unknown)=>String(v??"").trim();
const email=(v:unknown)=>text(v).toLowerCase();
const one=<T,>(v:T|T[]|null|undefined):T|null=>Array.isArray(v)?v[0]??null:v??null;
function expired(v:unknown){const value=text(v);return Boolean(value&&new Date(value).getTime()<Date.now())}
function slotPhase(slot:{slot_date:string;starts_at:string;ends_at:string}){const now=new Date();const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);if(slot.slot_date>date)return"upcoming";if(slot.slot_date<date)return"closed";const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now).split(":").map(Number),minutes=parts[0]*60+parts[1];const toMinutes=(v:string)=>{const[h,m]=v.slice(0,5).split(":").map(Number);return h*60+m};if(minutes<toMinutes(slot.starts_at))return"upcoming";if(minutes<=toMinutes(slot.ends_at))return"open";return"closed"}

export async function GET(_request:Request,{params}:Params){
 const{token}=await params;const clean=text(token);if(!clean)return NextResponse.json({error:"Lien invalide."},{status:400});
 const admin=getAdminSupabase();
 const{data:access,error:accessError}=await admin.from("daily_portal_access_tokens").select("id,session_id,portal_type,entity_email,status,expires_at").eq("token",clean).maybeSingle();
 if(accessError)return NextResponse.json({error:accessError.message},{status:500});if(!access)return NextResponse.json({error:"Portail introuvable."},{status:404});if(["revoked","expired"].includes(text(access.status))||expired(access.expires_at))return NextResponse.json({error:"Cet accès n’est plus actif."},{status:410});if(!["trainer","learner"].includes(text(access.portal_type)))return NextResponse.json({error:"Suivi de présence indisponible pour cet espace."},{status:403});
 const{data:session,error:sessionError}=await admin.from("daily_sessions").select("id,organisation_id,status,daily_formations(title)").eq("id",access.session_id).neq("status","archived").maybeSingle();if(sessionError)return NextResponse.json({error:sessionError.message},{status:500});if(!session)return NextResponse.json({error:"Session introuvable."},{status:404});
 const[slotsR,enrolmentsR,recordsR]=await Promise.all([
  admin.from("daily_attendance_slots").select("id,slot_date,starts_at,ends_at,label,status").eq("session_id",session.id).eq("organisation_id",session.organisation_id).neq("status","cancelled").order("slot_date").order("starts_at"),
  admin.from("daily_session_enrolments").select("id,status,daily_learners(id,first_name,last_name,email)").eq("session_id",session.id).eq("organisation_id",session.organisation_id),
  admin.from("daily_attendance_records").select("id,slot_id,enrolment_id,status,signed_at").eq("session_id",session.id).eq("organisation_id",session.organisation_id),
 ]);const readError=slotsR.error??enrolmentsR.error??recordsR.error;if(readError)return NextResponse.json({error:readError.message},{status:500});
 const enrolments=(enrolmentsR.data??[]).filter(row=>!INACTIVE.has(text(row.status))).filter(row=>{if(access.portal_type==="trainer")return true;const learner=one(row.daily_learners as any);return email(learner?.email)===email(access.entity_email)});
 const records=recordsR.data??[];
 const participants=enrolments.map(row=>{const learner=one(row.daily_learners as any) as Json|null;return{id:row.id,firstName:learner?.first_name??null,lastName:learner?.last_name??null,email:learner?.email??null}});
 const slots=(slotsR.data??[]).map(slot=>({id:slot.id,date:slot.slot_date,startsAt:slot.starts_at,endsAt:slot.ends_at,label:slot.label,status:slot.status,phase:slotPhase(slot),attendance:enrolments.map(row=>{const record=records.find(r=>r.slot_id===slot.id&&r.enrolment_id===row.id);return{enrolmentId:row.id,status:record?.status??"pending",signedAt:record?.signed_at??null}})}));
 const formation=one(session.daily_formations as any) as Json|null;
 return NextResponse.json({role:access.portal_type,session:{id:session.id,title:text(formation?.title)||"Formation Selen Daily"},participants,slots});
}
