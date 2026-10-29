import { NextResponse } from "next/server";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

export async function GET(){
 const context=await getDailyClientWorkspace();
 if(!context.ok)return NextResponse.json({error:context.error},{status:context.status});
 const organisationId=context.workspace.membership.organisation_id;
 const{data,error}=await getAdminSupabase().from("organisations").select("daily_task_reminder_mode,daily_task_digest_hour").eq("id",organisationId).single();
 if(error)return NextResponse.json({error:error.message},{status:500});
 return NextResponse.json({mode:data.daily_task_reminder_mode??"daily_digest",digestHour:Number(data.daily_task_digest_hour??7)});
}

export async function PATCH(req:Request){
 const context=await getDailyClientWorkspace();
 if(!context.ok)return NextResponse.json({error:context.error},{status:context.status});
 if(!context.workspace.capabilities.legal_profile)return NextResponse.json({error:"Accès au profil de l’organisme requis."},{status:403});
 const body=await req.json().catch(()=>({})) as Record<string,unknown>;
 const mode=body.mode==="immediate"?"immediate":body.mode==="daily_digest"?"daily_digest":null;
 if(!mode)return NextResponse.json({error:"Préférence de rappel invalide."},{status:400});
 const organisationId=context.workspace.membership.organisation_id;
 const{error}=await getAdminSupabase().from("organisations").update({daily_task_reminder_mode:mode,daily_task_digest_hour:7}).eq("id",organisationId);
 if(error)return NextResponse.json({error:error.message},{status:500});
 return NextResponse.json({mode,digestHour:7});
}
