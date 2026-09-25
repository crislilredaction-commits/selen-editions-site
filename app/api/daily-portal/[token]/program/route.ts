import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { buildTrainingProgramPdf } from "@/lib/server/dailyTrainingProgramPdf";

type Params={params:Promise<{token:string}>};
const fields="id,title,global_objective,learning_objectives,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,detailed_program,accessibility,pedagogical_methods,pedagogical_resources,evaluation_methods,contact_phone,contact_email,contact_website";

export async function GET(_request:Request,{params}:Params){
 const{token}=await params;const clean=String(token??"").trim();if(!clean)return NextResponse.json({error:"Lien invalide."},{status:400});
 const admin=getAdminSupabase();
 const{data:access,error:accessError}=await admin.from("daily_portal_access_tokens").select("session_id,portal_type,status,expires_at").eq("token",clean).maybeSingle();
 if(accessError)return NextResponse.json({error:accessError.message},{status:500});
 if(!access||access.portal_type!=="learner")return NextResponse.json({error:"Programme introuvable."},{status:404});
 if(["revoked","expired"].includes(String(access.status??"")))return NextResponse.json({error:"Cet accès n’est plus actif."},{status:403});
 if(access.expires_at&&new Date(access.expires_at).getTime()<Date.now())return NextResponse.json({error:"Ce lien a expiré."},{status:410});
 const{data:session,error:sessionError}=await admin.from("daily_sessions").select(`id,organisation_id,daily_formations(${fields})`).eq("id",access.session_id).neq("status","archived").maybeSingle();
 if(sessionError)return NextResponse.json({error:sessionError.message},{status:500});if(!session)return NextResponse.json({error:"Session introuvable."},{status:404});
 const formation:any=Array.isArray(session.daily_formations)?session.daily_formations[0]:session.daily_formations;if(!formation)return NextResponse.json({error:"Programme introuvable."},{status:404});
 const{data:org}=await admin.from("daily_onboarding").select("organisation_name").eq("organisation_id",session.organisation_id).maybeSingle();
 const pdf=buildTrainingProgramPdf(formation,{name:org?.organisation_name??null});
 const filename=`programme-${String(formation.title??"formation").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"formation"}.pdf`;
 return new NextResponse(pdf,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${filename}"`,"Cache-Control":"private, no-store"}});
}
