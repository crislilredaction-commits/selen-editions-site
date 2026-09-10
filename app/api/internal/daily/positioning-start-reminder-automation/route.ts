import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { prepareDailyPositioningStartReminder, sendDailyPositioningStartReminder } from "@/lib/server/dailyPositioningStartReminderEmails";

const PARIS_TIME_ZONE = "Europe/Paris";
const DONE = new Set(["completed", "validated", "done"]);
const INACTIVE = new Set(["declined", "cancelled", "abandoned"]);

type Json = Record<string, unknown>;
type Trainer = { id:string; display_name:string|null; professional_email:string|null; status:string|null };
type Learner = { first_name?:string|null; last_name?:string|null; email?:string|null };
type Enrolment = { id:string; session_id:string; status:string|null; positioning_status:string|null; daily_learners:Learner|Learner[]|null };
type Session = { id:string; organisation_id:string; start_date:string; schedule_blocks:unknown; trainer_ids:unknown; status:string|null; daily_formations:{title?:string|null;positioning_mode?:string|null}|{title?:string|null;positioning_mode?:string|null}[]|null };

function text(value:unknown){return String(value??"").trim()}
function one<T>(value:T|T[]|null|undefined):T|null{return Array.isArray(value)?value[0]??null:value??null}
function ids(value:unknown){return Array.isArray(value)?[...new Set(value.map(text).filter(Boolean))]:[]}
function clock(now=new Date()) { const parts=new Intl.DateTimeFormat("en-CA",{timeZone:PARIS_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));return{date:`${v.year}-${v.month}-${v.day}`,minutes:Number(v.hour)*60+Number(v.minute)} }
function firstStart(schedule:unknown,date:string){if(!Array.isArray(schedule))return null;const values=schedule.map(raw=>raw&&typeof raw==="object"?raw as Json:{}).filter(row=>text(row.date)===date).map(row=>text(row.start)).filter(v=>/^\d{2}:\d{2}$/.test(v)).sort();if(!values.length)return null;const[h,m]=values[0].split(":").map(Number);return h*60+m}
function learnerName(row:Enrolment){const learner=one(row.daily_learners);return [learner?.first_name,learner?.last_name].filter(Boolean).join(" ").trim()||text(learner?.email)||"Apprenant"}
function authorized(req:Request){const expected=process.env.DAILY_AUTOMATION_SECRET?.trim();if(!expected)return{ok:false as const,status:503,error:"DAILY_AUTOMATION_SECRET manquant."};const received=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"").trim();if(!received||received!==expected)return{ok:false as const,status:401,error:"Accès refusé."};return{ok:true as const}}

export async function GET(req:Request){
 const access=authorized(req);if(!access.ok)return NextResponse.json({error:access.error},{status:access.status});
 const url=new URL(req.url),execute=url.searchParams.get("execute")==="1",now=clock(),admin=getAdminSupabase();
 const{data:sessionRows,error:sessionError}=await admin.from("daily_sessions").select("id,organisation_id,start_date,schedule_blocks,trainer_ids,status,daily_formations(title,positioning_mode)").eq("start_date",now.date).neq("status","archived");
 if(sessionError)return NextResponse.json({error:sessionError.message},{status:500});
 const sessions=(sessionRows??[]) as Session[];const dueSessions=sessions.filter(session=>{const formation=one(session.daily_formations);const start=firstStart(session.schedule_blocks,now.date);return formation?.positioning_mode==="selen"&&start!==null&&now.minutes>=start&&ids(session.trainer_ids).length>0});
 if(!dueSessions.length)return NextResponse.json({ok:true,execute,date:now.date,due:0,processed:0,skipped:0,failed:0,details:[]});
 const sessionIds=dueSessions.map(s=>s.id),trainerIds=[...new Set(dueSessions.flatMap(s=>ids(s.trainer_ids)))];
 const[enrolmentsR,trainersR,communicationsR,tokensR]=await Promise.all([
  admin.from("daily_session_enrolments").select("id,session_id,status,positioning_status,daily_learners(first_name,last_name,email)").in("session_id",sessionIds),
  admin.from("daily_trainer_profiles").select("id,display_name,professional_email,status").in("id",trainerIds).not("status","in","(rejected,archived)"),
  admin.from("daily_communications").select("id,session_id,recipient_email,status,metadata,sent_at").in("session_id",sessionIds).eq("communication_type","positioning_start_reminder").in("status",["queued","sent","delivered"]),
  admin.from("daily_portal_access_tokens").select("session_id,entity_email,token,status,expires_at").in("session_id",sessionIds).eq("portal_type","trainer").not("status","in","(revoked,expired)"),
 ]);
 const readError=enrolmentsR.error??trainersR.error??communicationsR.error??tokensR.error;if(readError)return NextResponse.json({error:readError.message},{status:500});
 const enrolments=(enrolmentsR.data??[]) as Enrolment[],trainers=new Map(((trainersR.data??[]) as Trainer[]).map(t=>[t.id,t])),communications=communicationsR.data??[],tokens=tokensR.data??[];
 let due=0,processed=0,skipped=0,failed=0;const details:Array<{session_id:string;trainer_id:string;status:string;missing:number}>=[];
 for(const session of dueSessions){
  const missing=enrolments.filter(e=>e.session_id===session.id&&!INACTIVE.has(e.status??"")&&!DONE.has(e.positioning_status??""));if(!missing.length)continue;
  const formation=one(session.daily_formations),formationTitle=text(formation?.title)||"Formation Selen Daily",names=missing.map(learnerName);
  for(const trainerId of ids(session.trainer_ids)){
   const trainer=trainers.get(trainerId),email=text(trainer?.professional_email).toLowerCase();if(!trainer||!email){skipped++;details.push({session_id:session.id,trainer_id:trainerId,status:"missing_trainer_email",missing:missing.length});continue}
   const already=communications.some(row=>row.session_id===session.id&&text(row.recipient_email).toLowerCase()===email&&row.metadata&&typeof row.metadata==="object"&&text((row.metadata as Json).trainer_profile_id)===trainerId);if(already){skipped++;details.push({session_id:session.id,trainer_id:trainerId,status:"already_sent",missing:missing.length});continue}
   due++;if(!execute){details.push({session_id:session.id,trainer_id:trainerId,status:"due",missing:missing.length});continue}
   const token=tokens.find(row=>row.session_id===session.id&&text(row.entity_email).toLowerCase()===email&&(!row.expires_at||new Date(row.expires_at).getTime()>Date.now()));const workspaceUrl=token?.token?`${url.origin}/daily/portail/trainer/${encodeURIComponent(token.token)}`:null;
   const input={email,trainerName:text(trainer.display_name),formationTitle,missingLearnerNames:names,workspaceUrl};const prepared=prepareDailyPositioningStartReminder(input);
   const{data:communication,error:evidenceError}=await admin.from("daily_communications").insert({organisation_id:session.organisation_id,session_id:session.id,communication_type:"positioning_start_reminder",channel:"email",recipient_email:email,recipient_name:text(trainer.display_name)||null,subject:prepared.subject,text_body:prepared.text,html_body:prepared.html,provider:"resend",status:"queued",created_by:null,metadata:{trainer_profile_id:trainerId,missing_enrolment_ids:missing.map(e=>e.id),missing_count:missing.length,automation:true,session_start_date:session.start_date}}).select("id").single();
   if(evidenceError||!communication){failed++;details.push({session_id:session.id,trainer_id:trainerId,status:"evidence_failed",missing:missing.length});continue}
   const sent=await sendDailyPositioningStartReminder(input);if(!sent.sent){await admin.from("daily_communications").update({status:"failed",failed_at:new Date().toISOString(),failure_reason:sent.reason}).eq("id",communication.id);failed++;details.push({session_id:session.id,trainer_id:trainerId,status:sent.reason,missing:missing.length});continue}
   const sentAt=new Date().toISOString(),{error:finalizeError}=await admin.from("daily_communications").update({provider_message_id:sent.message.providerMessageId,status:"sent",sent_at:sentAt,failed_at:null,failure_reason:null}).eq("id",communication.id);if(finalizeError)failed++;else processed++;details.push({session_id:session.id,trainer_id:trainerId,status:finalizeError?"sent_evidence_finalize_failed":"sent",missing:missing.length});
  }
 }
 return NextResponse.json({ok:failed===0,execute,date:now.date,due,processed,skipped,failed,details},{status:failed===0?200:207});
}
export async function POST(req:Request){return GET(req)}
