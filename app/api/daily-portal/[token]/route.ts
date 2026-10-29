import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import {DAILY_PORTAL_RESOURCE_STATUSES,isDailyPortalResourceVisible} from "@/lib/server/dailyPortalResourceVisibility";
import {isPostsessionDownloadAvailable} from "@/lib/server/dailyPersonalAttendance";
import {positioningSourceDocumentId} from "@/lib/daily/ownPositioning";
import {matchesDailyLearnerPortalAccess,hasUniqueDailyLearnerRecipientEmail} from "@/lib/server/dailyPortalLearnerIdentity";
import {resolveEnterprisePortalCompany,matchesEnterprisePortalRecipient} from "@/lib/daily/enterprisePortalIdentity.mjs";

type Params={params:Promise<{token:string}>};type JsonRecord=Record<string,unknown>;
const learnerWorkspaceDocumentTypes=["training_program","convocation","registration_positioning","completion_certificate","organisation_shared"];
const cleanToken=(v?:string|null)=>String(v??"").trim();const normalizedEmail=(v:unknown)=>String(v??"").trim().toLowerCase();
function asArray(v:unknown):JsonRecord[]{return Array.isArray(v)?v.filter(x=>x&&typeof x==="object") as JsonRecord[]:[]}
function portalRole(v:string){return v==="learner"?"apprenant":v==="enterprise"?"entreprise":"formateur"}
function isExpired(v?:string|null){return Boolean(v&&new Date(v).getTime()<Date.now())}
function relatedLearner(v:unknown):JsonRecord|null{return Array.isArray(v)?v[0]&&typeof v[0]==="object"?v[0] as JsonRecord:null:v&&typeof v==="object"?v as JsonRecord:null}

async function loadLearnerDocuments(supabase:ReturnType<typeof getAdminSupabase>,session:JsonRecord,enrolment:JsonRecord|null){
 if(!enrolment)return[];
 const{data:documents,error:documentError}=await supabase.from("daily_documents").select("id,document_type,linked_object_type,linked_object_id,logical_name,version,status,mime_type,created_at,metadata").eq("organisation_id",session.organisation_id).eq("is_current",true).is("archived_at",null).in("status",DAILY_PORTAL_RESOURCE_STATUSES).in("document_type",learnerWorkspaceDocumentTypes).order("created_at",{ascending:false});if(documentError)throw documentError;
 return(documents??[]).filter(document=>isDailyPortalResourceVisible({resource:document,role:"learner",sessionId:String(session.id??""),enrolmentIds:[String(enrolment.id??"")],learnerIds:[String(enrolment.learner_id??"")],postsessionAvailable:isPostsessionDownloadAvailable(session.end_date)}))
}

export async function GET(_request:Request,{params}:Params){
 const{token}=await params;const clean=cleanToken(token);if(!clean)return NextResponse.json({error:"Lien invalide."},{status:400});const supabase=getAdminSupabase();const{data:access,error:accessError}=await supabase.from("daily_portal_access_tokens").select("*").eq("token",clean).maybeSingle();if(accessError)return NextResponse.json({error:accessError.message},{status:500});if(!access)return NextResponse.json({error:"Portail introuvable."},{status:404});if(!["learner","trainer","enterprise"].includes(String(access.portal_type??"")))return NextResponse.json({error:"Rôle de portail non autorisé."},{status:403});if(!["pending","viewed"].includes(String(access.status??"")))return NextResponse.json({error:"Cet accès n’est plus actif."},{status:403});if(isExpired(access.expires_at)){await supabase.from("daily_portal_access_tokens").update({status:"expired"}).eq("id",access.id);return NextResponse.json({error:"Ce lien de portail a expiré."},{status:410})}
 const[sessionR,onboardingR,responsesR,conventionsR,trainersR,convocationsR,enrolmentsR]=await Promise.all([
  supabase.from("daily_sessions").select("*, daily_formations(id,title,status,global_objective,target_audience,duration_hours,duration_days,modality,prerequisites,evaluation_methods)").eq("id",access.session_id).neq("status","archived").maybeSingle(),
  supabase.from("daily_onboarding").select("organisation_name,platform_contact_first_name,platform_contact_last_name,platform_contact_email,address").eq("user_id",access.user_id).maybeSingle(),
  supabase.from("daily_registration_responses").select("id,response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,need_answers,positioning_answers,adaptation_needed,submitted_at").eq("session_id",access.session_id),
  supabase.from("daily_conventions").select("id,recipient_type,recipient_key,recipient_name,recipient_email,company_name,version,document_name,generated_at,daily_convention_signatures(id,signatory_type,signatory_name,signatory_email,status,signed_at)").eq("session_id",access.session_id),
  supabase.from("daily_trainers").select("id,first_name,last_name,email").eq("user_id",access.user_id),
  supabase.from("daily_convocations").select("id,recipient_type,recipient_key,recipient_name,recipient_email,company_name,version,document_name,status,sent_at,generated_at").eq("session_id",access.session_id),
  supabase.from("daily_session_enrolments").select("id,learner_id,company_name,status,positioning_status,prerequisites_status,source,created_at,daily_learners(id,first_name,last_name,email)").eq("session_id",access.session_id),
 ]);if(sessionR.error)return NextResponse.json({error:sessionR.error.message},{status:500});if(enrolmentsR.error)return NextResponse.json({error:enrolmentsR.error.message},{status:500});
 // A partial read must never masquerade as an empty document/signature/response list.
 // Keep the portal token unchanged so the recipient can retry after a transient failure.
 if([onboardingR,responsesR,conventionsR,trainersR,convocationsR].some(result=>result.error))
  return NextResponse.json({error:"Les informations de cet espace sont temporairement indisponibles. Réessayez."},{status:503});
 const session=sessionR.data;if(!session)return NextResponse.json({error:"Session introuvable."},{status:404});
 const entityEmail=normalizedEmail(access.entity_email),entityName=String(access.entity_name??"").trim().toLowerCase();
 const activeEnrolments=(enrolmentsR.data??[]).filter(row=>!["declined","cancelled","abandoned"].includes(String(row.status??"")));
  // Resolve identity against ALL session enrolments before filtering inactive rows.
  // A cancelled learner sharing an email must not transfer a legacy link.
  const learnerMatches=access.portal_type==="learner"?(enrolmentsR.data??[]).filter(row=>matchesDailyLearnerPortalAccess(access,row)):[];
  const learnerEmailRecipientUnique=access.portal_type==="learner"&&hasUniqueDailyLearnerRecipientEmail(access,enrolmentsR.data??[]);
 const activeLearnerEnrolment=learnerMatches.length===1&&!["declined","cancelled","abandoned"].includes(String(learnerMatches[0].status??""))?learnerMatches[0]:null;
 if(access.portal_type==="learner"&&!activeLearnerEnrolment){if(learnerMatches.length>1)return NextResponse.json({error:"Identité apprenant ambiguë. Contactez votre organisme de formation."},{status:409});await supabase.from("daily_portal_access_tokens").update({status:"revoked",updated_at:new Date().toISOString()}).eq("id",access.id);return NextResponse.json({error:"Cette inscription n’est plus active."},{status:403})}
 if(access.status==="pending")await supabase.from("daily_portal_access_tokens").update({status:"viewed",viewed_at:new Date().toISOString()}).eq("id",access.id);
 let learnerDocuments:JsonRecord[]=[];try{learnerDocuments=await loadLearnerDocuments(supabase,session as JsonRecord,activeLearnerEnrolment as JsonRecord|null) as JsonRecord[]}catch(cause){return NextResponse.json({error:cause instanceof Error?cause.message:"Documents indisponibles."},{status:500})}
 // The learner portal URL is authorized by its active private access token.
 let publicProgramPdfUrl:string|undefined;
 if(access.portal_type==="learner"&&session.formation_id&&session.organisation_id){
  const{data:formation,error:formationError}=await supabase.from("daily_formations").select("id,organisation_id,status,creation_mode,public_registration_enabled,public_registration_token,detailed_program_document_url").eq("id",session.formation_id).eq("organisation_id",session.organisation_id).maybeSingle();
  if(formationError)return NextResponse.json({error:formationError.message},{status:500});
  if(formation&&formation.id===session.formation_id&&formation.organisation_id===session.organisation_id&&formation.status==="validated"&&["selen_form","program_import"].includes(formation.creation_mode??"selen_form")){
   let available=formation.creation_mode!=="program_import";
   if(formation.creation_mode==="program_import"){
    const sourceId=positioningSourceDocumentId(formation.detailed_program_document_url);
    if(sourceId){
     const{data:source,error:sourceError}=await supabase.from("daily_documents")
      .select("id,bucket,storage_path,is_current,status,archived_at,formation_id")
      .eq("id",sourceId).eq("organisation_id",session.organisation_id)
      .eq("document_type","training_program_source")
      .eq("linked_object_type","organisation").eq("linked_object_id",session.organisation_id)
      .maybeSingle();
     if(sourceError)return NextResponse.json({error:sourceError.message},{status:500});
     available=Boolean(source&&source.is_current&&!source.archived_at&&source.status!=="archived"
      &&(!source.formation_id||source.formation_id===formation.id)
      &&source.bucket==="documents"&&source.storage_path?.startsWith("daily/"+session.organisation_id+"/"));
    }
   }
   if(available)publicProgramPdfUrl=`/api/daily-portal/${encodeURIComponent(clean)}/program-pdf`;
  }
 }
 const responseRows=responsesR.data??[],conventionRows=conventionsR.data??[];const individualLearners=asArray(session.individual_beneficiaries),companyLearners=asArray(session.beneficiaries),companies=asArray(session.companies);const learner=access.portal_type==="learner"?relatedLearner(activeLearnerEnrolment?.daily_learners):null;
 const enterpriseIdentity=access.portal_type==="enterprise"?resolveEnterprisePortalCompany(companies,entityEmail):null;
 if(enterpriseIdentity&&enterpriseIdentity.status!=="ok")return NextResponse.json({error:enterpriseIdentity.status==="ambiguous"?"Plusieurs entreprises correspondent à cet accès. Contactez votre organisme de formation.":"Cet accès entreprise n’est plus associé à cette session."},{status:enterpriseIdentity.status==="ambiguous"?409:403});
 const company=access.portal_type==="enterprise"?enterpriseIdentity?.company??null:companies.find(item=>{const email=normalizedEmail(item.email),name=String(item.name??"").trim().toLowerCase();return(entityEmail&&email===entityEmail)||(entityName&&name===entityName)})??null;
 const companyName=String(company?.name??"").trim().toLowerCase();
 const enterpriseParticipants=access.portal_type==="enterprise"?activeEnrolments.filter(row=>Boolean(companyName)&&String(row.company_name??"").trim().toLowerCase()===companyName).map(row=>{const linked=relatedLearner(row.daily_learners);return{id:row.id,first_name:linked?.first_name??null,last_name:linked?.last_name??null,email:linked?.email??null}}):[];
 const enrolment=activeLearnerEnrolment;
 const participantProgress=access.portal_type==="trainer"?activeEnrolments.map(row=>{const linked=relatedLearner(row.daily_learners);return{id:row.id,learnerId:row.learner_id,firstName:linked?.first_name??null,lastName:linked?.last_name??null,email:linked?.email??null,positioningStatus:row.positioning_status??"not_started",prerequisitesStatus:row.prerequisites_status??"not_reviewed"}}):[];
 const filteredResponses=access.portal_type==="learner"?(learnerEmailRecipientUnique?responseRows.filter(r=>normalizedEmail(r.respondent_email)===entityEmail):[]):access.portal_type==="enterprise"?responseRows.filter(r=>matchesEnterprisePortalRecipient(r.respondent_email,entityEmail)):responseRows;
 const filteredConventions=access.portal_type==="learner"?(learnerEmailRecipientUnique?conventionRows.filter(c=>c.recipient_type==="beneficiary"&&(entityEmail&&normalizedEmail(c.recipient_email)===entityEmail)):[]):access.portal_type==="enterprise"?conventionRows.filter(c=>c.recipient_type==="company"&&matchesEnterprisePortalRecipient(c.recipient_email,entityEmail)):[];
 const convocationRows=convocationsR.data??[];const filteredConvocations=access.portal_type==="learner"?(learnerEmailRecipientUnique?convocationRows.filter(c=>c.recipient_type==="beneficiary"&&(entityEmail&&normalizedEmail(c.recipient_email)===entityEmail)):[]):access.portal_type==="enterprise"?convocationRows.filter(c=>c.recipient_type==="company"&&matchesEnterprisePortalRecipient(c.recipient_email,entityEmail)):convocationRows.filter(c=>c.recipient_type==="trainer"&&entityEmail&&normalizedEmail(c.recipient_email)===entityEmail);
 const publicSession={id:session.id,internal_reference:session.internal_reference,modality:session.modality,distance_mode:session.distance_mode,blended_elearning_periods:session.blended_elearning_periods,blended_in_person_days:session.blended_in_person_days,schedule_blocks:session.schedule_blocks,location_address:session.location_address,remote_url:session.remote_url,status:session.status,start_date:session.start_date,end_date:session.end_date,max_participants:session.max_participants,daily_formations:session.daily_formations};
 return NextResponse.json({access:{portalType:access.portal_type,roleLabel:portalRole(access.portal_type),entityName:access.entity_name,entityEmail:access.entity_email,viewedAt:access.viewed_at},session:publicSession,onboarding:onboardingR.data,learner,enrolment,company,companies:access.portal_type==="trainer"?companies:company?[company]:[],participants:access.portal_type==="enterprise"?enterpriseParticipants:access.portal_type==="trainer"?[...individualLearners,...companyLearners,...companies.flatMap(item=>asArray(item.participants))]:learner?[learner]:[],participantProgress,trainers:trainersR.data??[],responses:filteredResponses,conventions:filteredConventions,convocations:filteredConvocations,documents:learnerDocuments,...(publicProgramPdfUrl?{publicProgramPdfUrl}:{})})
}
