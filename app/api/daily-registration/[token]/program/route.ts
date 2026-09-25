import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { buildTrainingProgramPdf } from "@/lib/server/dailyTrainingProgramPdf";

type Params={params:Promise<{token:string}>};
const fields="id,user_id,title,global_objective,learning_objectives,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,detailed_program,accessibility,pedagogical_methods,pedagogical_resources,evaluation_methods,contact_phone,contact_email,contact_website";

export async function GET(_request:Request,{params}:Params){
 const{token}=await params;const clean=String(token??"").trim();if(!clean)return NextResponse.json({error:"Lien invalide."},{status:400});
 const admin=getAdminSupabase();
 const{data:session}=await admin.from("daily_sessions").select(`user_id,daily_formations(${fields})`).eq("registration_token",clean).neq("status","archived").maybeSingle();
 let formation:any=session?(Array.isArray(session.daily_formations)?session.daily_formations[0]:session.daily_formations):null;let userId=session?.user_id??null;
 if(!formation){const{data}=await admin.from("daily_formations").select(fields).eq("public_registration_token",clean).eq("public_registration_enabled",true).neq("status","archived").maybeSingle();formation=data;userId=data?.user_id??null;}
 if(!formation)return NextResponse.json({error:"Programme introuvable."},{status:404});
 const{data:org}=userId?await admin.from("daily_onboarding").select("organisation_name").eq("user_id",userId).maybeSingle():{data:null};
 const pdf=buildTrainingProgramPdf(formation,{name:org?.organisation_name??null});
 const filename=`programme-${String(formation.title??"formation").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"formation"}.pdf`;
 return new NextResponse(pdf,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${filename}"`,"Cache-Control":"private, no-store"}});
}
