import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { prepareDailySignatureFollowupEmail, sendDailySignatureFollowup } from "@/lib/server/dailySignatureInvitationEmails";
import { DAILY_SIGNATURE_J3_STAGE, DAILY_SIGNATURE_J6_STAGE, DAILY_SIGNATURE_REMINDER_TYPE, escalateDailySignatureReminderBeforeStart, moveDailySignatureReminderToJ6Email, moveDailySignatureReminderToJ9PhoneCall, resolveDailySignatureFollowupReminder } from "@/lib/server/dailySignatureFollowupReminders";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function authorized(req: Request) {
 const expected=process.env.DAILY_AUTOMATION_SECRET?.trim(),received=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"").trim();
 if(!expected)return{ok:false as const,status:503,error:"DAILY_AUTOMATION_SECRET manquant."};
 if(!received||received!==expected)return{ok:false as const,status:401,error:"Accès refusé."};
 return{ok:true as const};
}
function one<T>(value:T|T[]|null|undefined):T|null{return Array.isArray(value)?value[0]??null:value??null}

export async function GET(req:Request){
 const access=authorized(req);if(!access.ok)return NextResponse.json({error:access.error},{status:access.status});
 const admin=getAdminSupabase();
 const {data,error}=await admin.from("client_reminders").select("id,prestation_id,due_at,metadata").eq("reminder_type",DAILY_SIGNATURE_REMINDER_TYPE).in("status",["ready","postponed"]).limit(200);
 if(error)return NextResponse.json({error:error.message},{status:500});
 let resolved=0,active=0,automaticEmailsSent=0,urgentEscalations=0;
 for(const reminder of data??[]){
  const signatureId=text(reminder.prestation_id||reminder.metadata?.signature_id);if(!signatureId)continue;
  const {data:signature}=await admin.from("daily_convention_signatures").select("id,convention_id,session_id,signatory_name,signatory_email,token,status,signed_at,expires_at").eq("id",signatureId).maybeSingle();
  if(!signature)continue;
  if(signature.status==="signed"||signature.signed_at||["expired","cancelled","revoked","refused"].includes(String(signature.status))){
   await resolveDailySignatureFollowupReminder(admin,signatureId,signature.signed_at??new Date().toISOString());resolved++;continue;
  }
  const stage=text(reminder.metadata?.followup_stage);
  const {data:session}=await admin.from("daily_sessions").select("id,start_date,daily_formations(title)").eq("id",signature.session_id).maybeSingle();
  const startAt=text(session?.start_date),startMs=startAt?new Date(startAt).getTime():NaN,dueMs=reminder.due_at?new Date(reminder.due_at).getTime():NaN;
  if(Number.isFinite(startMs)&&Number.isFinite(dueMs)&&startMs<=dueMs&&startMs>Date.now()){
   await escalateDailySignatureReminderBeforeStart(admin,{reminderId:reminder.id,trainingStartAt:startAt,metadata:reminder.metadata??{}});urgentEscalations++;continue;
  }
  if(!reminder.due_at||new Date(reminder.due_at).getTime()>Date.now()){active++;continue;}
  if(![DAILY_SIGNATURE_J3_STAGE,DAILY_SIGNATURE_J6_STAGE].includes(stage)){active++;continue;}
  const {data:convention}=await admin.from("daily_conventions").select("id,document_name,recipient_name,recipient_email,daily_sessions(daily_formations(title))").eq("id",signature.convention_id).maybeSingle();
  if(!convention){active++;continue;}
  const nestedSession=one(convention.daily_sessions as any),formation=one(nestedSession?.daily_formations as any);
  const input={email:text(signature.signatory_email||convention.recipient_email).toLowerCase(),signatoryName:text(signature.signatory_name||convention.recipient_name),documentName:text(convention.document_name)||"Convention de formation professionnelle",formationTitle:text(formation?.title)||"Formation Selen Daily",signatureUrl:`${new URL(req.url).origin}/daily-signature/${encodeURIComponent(signature.token)}`,expiresAt:signature.expires_at};
  if(!input.email){active++;continue;}
  const prepared=prepareDailySignatureFollowupEmail(input);
  const {data:communication,error:reserveError}=await admin.from("daily_communications").insert({session_id:signature.session_id,communication_type:"convention_signature_followup",channel:"email",recipient_email:input.email,recipient_name:input.signatoryName||null,subject:prepared.subject,text_body:prepared.text,html_body:prepared.html,provider:"resend",status:"queued",metadata:{signature_id:signature.id,convention_id:signature.convention_id,source:"daily",trigger:stage}}).select("id").single();
  if(reserveError||!communication){active++;continue;}
  const sent=await sendDailySignatureFollowup(input);
  if(!sent.sent){await admin.from("daily_communications").update({status:"failed",failed_at:new Date().toISOString(),failure_reason:sent.reason}).eq("id",communication.id);active++;continue;}
  const sentAt=new Date().toISOString();await admin.from("daily_communications").update({provider_message_id:sent.message.providerMessageId,status:"sent",sent_at:sentAt}).eq("id",communication.id);
  if(stage===DAILY_SIGNATURE_J3_STAGE){await admin.from("client_reminders").update({status:"postponed"}).eq("id",reminder.id);await moveDailySignatureReminderToJ6Email(admin,{reminderId:reminder.id,initialSentAt:text(reminder.metadata?.initial_sent_at),documentName:input.documentName,j3EmailSentAt:sentAt,metadata:reminder.metadata??{}});}
  else {await moveDailySignatureReminderToJ9PhoneCall(admin,{reminderId:reminder.id,initialSentAt:text(reminder.metadata?.initial_sent_at),documentName:input.documentName,j6EmailSentAt:sentAt,metadata:reminder.metadata??{}});}
  automaticEmailsSent++;
 }
 return NextResponse.json({ok:true,active,resolved,automaticEmailsSent,urgentEscalations});
}
export async function POST(req:Request){return GET(req);}
