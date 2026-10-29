import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
async function getManagerContext() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return context;
  if (!context.workspace.capabilities.trainers_all) return { ok:false as const,status:403,error:"Vous n’avez pas accès au suivi de l’ensemble des formateurs." };
  return { ...context, organisationId: context.workspace.membership.organisation_id };
}

export async function GET() {
  const context=await getManagerContext(); if(!context.ok)return NextResponse.json({error:context.error},{status:context.status});
  const organisationId=context.organisationId; const year=new Date().getUTCFullYear(); const admin=getAdminSupabase();
  const [{data:allTrainers,error:trainerError},{data:reviews,error:reviewError}]=await Promise.all([
    admin.from("daily_trainer_profiles").select("id,display_name,professional_email,status,engagement_type,specialties,cv_updated_at,cv_review_due_at").eq("organisation_id",organisationId).order("display_name",{ascending:true}),
    admin.from("daily_trainer_annual_reviews").select("id,trainer_profile_id,review_year,status,strengths,weaknesses,improvement_areas,proposed_solutions,submitted_at,manager_notified_at,reminder_count,next_reminder_at,manager_appreciation,manager_improvement_areas,manager_actions,manager_completed_at,manager_completed_by").eq("review_year",year),
  ]);
  const error=trainerError??reviewError;if(error)return NextResponse.json({error:error.message},{status:500});
  const exemptTrainers=(allTrainers??[]).filter(t=>t.engagement_type==="owner");
  const trainers=(allTrainers??[]).filter(t=>t.engagement_type!=="owner");
  const trainerIds=new Set(trainers.map(t=>t.id));const trainerIdList=Array.from(trainerIds);const organisationReviews=(reviews??[]).filter(r=>trainerIds.has(r.trainer_profile_id));const reviewIds=organisationReviews.map(r=>r.id);
  let trainings:Array<Record<string,unknown>>=[];if(reviewIds.length){const{data,error:trainingError}=await admin.from("daily_trainer_annual_review_trainings").select("id,annual_review_id,training_kind,title,provider,completed_on,attestation_document_id,note").in("annual_review_id",reviewIds).order("created_at",{ascending:true});if(trainingError)return NextResponse.json({error:trainingError.message},{status:500});trainings=data??[]}
  let certifications:Array<Record<string,unknown>>=[];const allTrainerIds=(allTrainers??[]).map(t=>t.id);if(allTrainerIds.length){const{data,error:certificationError}=await admin.from("daily_trainer_certifications").select("id,trainer_profile_id,title,issuer,reference,obtained_on,validity_mode,valid_until,note").in("trainer_profile_id",allTrainerIds).order("valid_until",{ascending:true,nullsFirst:false});if(certificationError)return NextResponse.json({error:certificationError.message},{status:500});certifications=data??[]}
  const reviewByTrainer=new Map(organisationReviews.map(r=>[r.trainer_profile_id,r]));const trainingsByReview=new Map<string,Array<Record<string,unknown>>>();for(const training of trainings){const id=String(training.annual_review_id??"");const list=trainingsByReview.get(id)??[];list.push(training);trainingsByReview.set(id,list)}
  const certificationsByTrainer=new Map<string,Array<Record<string,unknown>>>();for(const certification of certifications){const id=String(certification.trainer_profile_id??"");const list=certificationsByTrainer.get(id)??[];list.push(certification);certificationsByTrainer.set(id,list)}
  const mapped=trainers.map(trainer=>{const review=reviewByTrainer.get(trainer.id)??null;return{...trainer,annual_review_exempt:false,review,trainings:review?.id?trainingsByReview.get(review.id)??[]:[],certifications:certificationsByTrainer.get(trainer.id)??[]}});
  const exempt=exemptTrainers.map(trainer=>({...trainer,annual_review_exempt:true,review:null,trainings:[],certifications:certificationsByTrainer.get(trainer.id)??[]}));
  return NextResponse.json({year,trainers:mapped,exemptTrainers:exempt});
}

export async function PATCH(req:Request){
  const context=await getManagerContext();if(!context.ok)return NextResponse.json({error:context.error},{status:context.status});
  const body=(await req.json().catch(()=>({}))) as Record<string,unknown>;const reviewId=clean(body.review_id);if(!reviewId)return NextResponse.json({error:"Auto-évaluation requise."},{status:400});const admin=getAdminSupabase();
  const{data:review,error:reviewError}=await admin.from("daily_trainer_annual_reviews").select("id,trainer_profile_id,status").eq("id",reviewId).maybeSingle();if(reviewError)return NextResponse.json({error:reviewError.message},{status:500});if(!review)return NextResponse.json({error:"Auto-évaluation introuvable."},{status:404});if(review.status!=="submitted")return NextResponse.json({error:"La contribution du dirigeant est disponible après transmission de l’auto-évaluation par le formateur."},{status:409});
  const{data:trainer,error:trainerError}=await admin.from("daily_trainer_profiles").select("id,engagement_type").eq("id",review.trainer_profile_id).eq("organisation_id",context.organisationId).maybeSingle();if(trainerError)return NextResponse.json({error:trainerError.message},{status:500});if(!trainer)return NextResponse.json({error:"Cette auto-évaluation n’appartient pas à votre organisme."},{status:403});if(trainer.engagement_type==="owner")return NextResponse.json({error:"Le dirigeant-formateur est exempté d’auto-évaluation annuelle."},{status:409});
  const managerAppreciation=clean(body.manager_appreciation),managerImprovementAreas=clean(body.manager_improvement_areas),managerActions=clean(body.manager_actions),hasContribution=Boolean(managerAppreciation||managerImprovementAreas||managerActions),now=new Date().toISOString();
  const{data:updated,error:updateError}=await admin.from("daily_trainer_annual_reviews").update({manager_appreciation:managerAppreciation||null,manager_improvement_areas:managerImprovementAreas||null,manager_actions:managerActions||null,manager_completed_at:hasContribution?now:null,manager_completed_by:hasContribution?context.user.id:null,updated_at:now}).eq("id",review.id).eq("trainer_profile_id",review.trainer_profile_id).select("manager_appreciation,manager_improvement_areas,manager_actions,manager_completed_at,manager_completed_by").single();if(updateError)return NextResponse.json({error:updateError.message},{status:500});return NextResponse.json({ok:true,manager:updated});
}
