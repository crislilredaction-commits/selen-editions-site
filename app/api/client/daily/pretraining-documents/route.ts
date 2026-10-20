import { resolveContractingPartyType, validateContractingParty } from "@/lib/dailyContractingParty";
import { NextResponse } from "next/server";
import { renderDailyPretrainingTemplate } from "@/lib/server/dailyPretrainingTemplate";
import { delegatedRegistrationTokenHash, getDelegatedRegistrationActor, registrationAssistanceToken } from "@/lib/server/dailyDelegatedRegistrationDecision";
import { logAgentAssistanceAction } from "@/lib/server/agentAssistance";
import { getDailyOrganisationBillingUserId, getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { buildConvocationHtml, buildRegistrationPositioningHtml, buildTrainingAgreementHtml, buildTrainingContractHtml, buildTrainingProgramHtml, buildWelcomeBookletHtml, buildInternalRegulationsHtml, type DailyPretrainingCommon } from "@/lib/server/dailyPretrainingDocumentHtml";

const documentTypes = ["training_program","training_agreement","training_contract","convocation","registration_positioning","welcome_booklet","internal_regulations"] as const;
type DocumentType = typeof documentTypes[number];

function text(value: unknown) { return String(value ?? "").trim(); }
function asArray(value: unknown) { return Array.isArray(value) ? value : []; }
function scheduleText(value: unknown) {
  return asArray(value).map((entry) => {
    const row = entry && typeof entry === "object" ? entry as Record<string,unknown> : {};
    return [row.date, row.start && row.end ? `${row.start}-${row.end}` : "", row.note].map(text).filter(Boolean).join(" ");
  }).filter(Boolean).join("\n") || "Non renseigné";
}
function safe(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9-_]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase().slice(0,80) || "document"; }
async function sha256Bytes(value: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", value as BufferSource);
  return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,"0")).join("");
}

async function generateCanonicalDocument(args: {
  onlyMissing?: boolean; template?: any; variables?: Record<string,string>; deferRetirement?: boolean; admin: any; organisationId: string; userId: string; documentType: DocumentType; linkedObjectType: "session"|"enrolment"; linkedObjectId: string; logicalName: string; filenameBase: string; html: string; metadata: Record<string,unknown>;
}) {
  const { admin, organisationId, userId, documentType, linkedObjectType, linkedObjectId, logicalName, filenameBase, html, metadata } = args;
  const { data: previousRows, error: previousError } = await admin.from("daily_documents").select("*").eq("organisation_id",organisationId).eq("document_type",documentType).eq("linked_object_type",linkedObjectType).eq("linked_object_id",linkedObjectId).eq("logical_name",logicalName).order("version",{ascending:false}).limit(1);
  if (previousError) throw new Error(previousError.message);
  const previous = previousRows?.[0] ?? null;
  if(args.onlyMissing && previous?.is_current && previous.status!=="archived")return previous;
  const rendered=await renderDailyPretrainingTemplate({admin,organisationId,template:args.template,variables:args.variables??{},html});
  const version = Number(previous?.version ?? 0) + 1;
  if (previous?.is_current && !args.deferRetirement) {
    const { error } = await admin.from("daily_documents").update({ is_current:false, updated_by:userId }).eq("id",previous.id);
    if (error) throw new Error(error.message);
  }
  const stamp = new Date().toISOString().replaceAll(":","-").replaceAll(".","-");
  const storagePath = `daily/${organisationId}/${linkedObjectType}/${linkedObjectId}/${documentType}/${safe(filenameBase)}-v${version}-${stamp}.${rendered.extension}`;
  const content = new Blob([rendered.bytes as BlobPart], { type:rendered.mimeType });
  const { error: uploadError } = await admin.storage.from("documents").upload(storagePath,content,{contentType:rendered.mimeType,upsert:false});
  if (uploadError) throw new Error(uploadError.message);
  const hash = await sha256Bytes(rendered.bytes);
  const { data, error } = await admin.from("daily_documents").insert({
    organisation_id:organisationId, formation_id:metadata.formation_id ?? null, session_id:metadata.session_id ?? null, learner_id:metadata.learner_id ?? null, enrolment_id:metadata.enrolment_id ?? null, document_type:documentType, linked_object_type:linkedObjectType, linked_object_id:linkedObjectId,
    version, status:"to_check", logical_name:logicalName, bucket:"documents", storage_path:storagePath, mime_type:rendered.mimeType,
    size_bytes:rendered.bytes.byteLength, sha256:hash, created_by:userId, updated_by:userId, is_current:true,
    previous_document_id:previous?.id ?? null, metadata:{...metadata,...rendered.metadata,generated_by:"daily_lot2e",generated_at:new Date().toISOString()}
  }).select("*").single();
  if (error) { await admin.storage.from("documents").remove([storagePath]); throw new Error(error.message); }
  return data;
}

async function loadSession(admin:any, organisationId:string, sessionId:string) {
  const { data: session, error } = await admin.from("daily_sessions").select("*,daily_formations(*)").eq("id",sessionId).eq("organisation_id",organisationId).single();
  if (error || !session) throw new Error("Session introuvable.");
  const [{ data: enrolments, error: enrolmentError }, { data: needs, error: needsError }, { data: org, error: orgError }, { data: trainers, error: trainerError }] = await Promise.all([
    admin.from("daily_session_enrolments").select("*,daily_learners(*)").eq("session_id",sessionId).eq("organisation_id",organisationId).not("status","in",'(declined,cancelled,abandoned)'),
    admin.from("daily_enrolment_support_needs").select("*").eq("organisation_id",organisationId),
    admin.from("organisations").select("*").eq("id",organisationId).single(),
    admin.from("daily_trainer_profiles").select("id,display_name").eq("organisation_id",organisationId),
  ]);
  const loadError = enrolmentError ?? needsError ?? orgError ?? trainerError;
  if (loadError) throw new Error(loadError.message);
  return { session, enrolments:enrolments ?? [], needs:needs ?? [], org, trainers:trainers ?? [] };
}

export async function GET(req:Request) {
  const context = await getDailyOrganisationContext(req,"sessions",{allowAssistanceRead:true});
  if (!context.ok) return NextResponse.json({error:context.error},{status:context.status});
  const sessionId = new URL(req.url).searchParams.get("session_id") ?? "";
  let query = context.admin.from("daily_documents").select("*").eq("organisation_id",context.organisationId).in("document_type",[...documentTypes]).eq("is_current",true).order("created_at",{ascending:false});
  if (sessionId) {
    const { data: enrolments } = await context.admin.from("daily_session_enrolments").select("id").eq("session_id",sessionId).eq("organisation_id",context.organisationId);
    const ids = (enrolments ?? []).map((row:any)=>row.id);
    query = ids.length ? query.or(`and(linked_object_type.eq.session,linked_object_id.eq.${sessionId}),and(linked_object_type.eq.enrolment,linked_object_id.in.(${ids.join(",")}))`) : query.eq("linked_object_type","session").eq("linked_object_id",sessionId);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({documents:data ?? []});
}

export async function POST(req:Request) {
  const context = await getDailyOrganisationContext(req,"sessions",{allowAssistanceWrite:true});
  if (!context.ok) return NextResponse.json({error:context.error},{status:context.status});
  const body = await req.json().catch(()=>({}));
  if(!body || typeof body!=="object" || Array.isArray(body))return NextResponse.json({error:"Demande documentaire invalide."},{status:400});
  if(registrationAssistanceToken(req) && !context.assisted)return NextResponse.json({error:"Délégation invalide ou expirée."},{status:403});
  let actorUserId=context.user.id;
  if(context.assisted){
    if(body.confirm_delegated!==true || !context.assistance)return NextResponse.json({error:"Confirmation de la préparation déléguée requise."},{status:400});
    try{actorUserId=getDelegatedRegistrationActor(context.assistance,context.organisationId).agentUserId;}
    catch{return NextResponse.json({error:"Délégation invalide ou expirée."},{status:403});}
    const delegationCheck=await context.admin.rpc("daily_assert_document_delegation",{p_assistance_id:context.assistance.id,p_token_hash:delegatedRegistrationTokenHash(req),p_organisation_id:context.organisationId});
    if(delegationCheck.error || delegationCheck.data!==actorUserId)return NextResponse.json({error:"Délégation invalide, expirée ou agent désactivé."},{status:403});
  }
  const sessionId = text(body.session_id);
  if (!sessionId) return NextResponse.json({error:"Session manquante."},{status:400});
  const targeted = Object.hasOwn(body,"enrolment_id");
  const enrolmentId = typeof body.enrolment_id==="string" ? body.enrolment_id.trim() : "";
  if(targeted && (!enrolmentId || body.only_missing!==true || typeof body.expected_enrolment_updated_at!=="string" || !body.expected_enrolment_updated_at.trim()))return NextResponse.json({error:"Inscription, version ouverte et conservation des pièces existantes requises."},{status:400});
  try {
    const { session, enrolments:sessionEnrolments, needs, org, trainers } = await loadSession(context.admin,context.organisationId,sessionId);
    if(["archived","cancelled"].includes(session.status))return NextResponse.json({error:"Session inaccessible."},{status:404});
    const enrolments = targeted ? sessionEnrolments.filter((row:any)=>row.id===enrolmentId) : sessionEnrolments;
    if(targeted && !enrolments.length)return NextResponse.json({error:"Inscription inaccessible dans cette session."},{status:404});
    if(targeted && enrolments[0].updated_at!==body.expected_enrolment_updated_at)return NextResponse.json({error:"L’inscription a changé. Rechargez le dossier avant de préparer ses documents."},{status:409});
    if(targeted && enrolments[0].daily_learners?.organisation_id!==context.organisationId)return NextResponse.json({error:"Rattachement apprenant incohérent."},{status:409});
    const formation = session.daily_formations ?? {};
    const trainerIds = asArray(session.trainer_ids).map(text);
    const trainerNames = trainers.filter((t:any)=>trainerIds.includes(t.id)).map((t:any)=>t.display_name).filter(Boolean).join(", ");
    const common:DailyPretrainingCommon = {
      organisationName:text(org?.legal_name || org?.name), organisationAddress:text(org?.administrative_address), organisationSiret:text(org?.siret), organisationNda:text(org?.nda_number),
      organisationEmail:text(org?.administrative_email), organisationPhone:text(org?.administrative_phone), formationTitle:text(formation.title), sessionReference:text(session.internal_reference),
      startDate:text(session.start_date), endDate:text(session.end_date), schedule:scheduleText(session.schedule_blocks), modality:text(session.modality), location:text(session.location_address || session.remote_url), generatedAt:new Date(),
    };
    if(body.only_missing===true && !enrolments.length)return NextResponse.json({error:"Aucune inscription active dans cette session."},{status:409});
    const billingUserId=await getDailyOrganisationBillingUserId(context.organisationId,context.user.id);
    const {data:templateRows,error:templateError}=await context.admin.from("daily_document_templates").select("id,document_type,template_version,template_name,storage_path").eq("user_id",billingUserId).eq("template_source","CLIENT").eq("status","active").order("template_version",{ascending:false});
    if(templateError)throw new Error("Lecture des modèles personnalisés impossible.");
    const templates=new Map<string,any>();
    for(const template of templateRows??[]){const type=template.document_type==="internal_rules"?"internal_regulations":template.document_type;if(!templates.has(type))templates.set(type,template);}
    const variables={ORGANISME:common.organisationName,SIRET:common.organisationSiret,ADRESSE_ORGANISME:common.organisationAddress,NDA:common.organisationNda,FORMATION:common.formationTitle,DATES:[common.startDate,common.endDate].join(" → "),DUREE:text(formation.duration_hours)+" heures",HORAIRES:common.schedule,MODALITE:common.modality,MODALITES_PRATIQUES:common.location,CONTACT:[common.organisationEmail,common.organisationPhone].filter(Boolean).join(" · "),ACCESSIBILITE:text(formation.accessibility),TARIF:text(formation.price),OBJECTIF:text(formation.global_objective),PREREQUIS:text(formation.prerequisites),FORMATEUR:trainerNames,DATE_DOCUMENT:new Date().toLocaleDateString("fr-FR")};
    const generateDocument=(args:Parameters<typeof generateCanonicalDocument>[0])=>generateCanonicalDocument({...args,onlyMissing:body.only_missing===true,deferRetirement:true,template:templates.get(args.documentType),metadata:{...args.metadata,session_name:common.formationTitle+" · "+common.startDate+" → "+common.endDate},variables:{...variables,SIRET_CLIENT:text(args.metadata.client_siret),BENEFICIAIRE:text(args.metadata.learner_name),CLIENT_OU_BENEFICIAIRE:text(args.metadata.company_name||args.metadata.learner_name)}});
    const companies = asArray(session.companies) as Record<string,unknown>[];
    // The contractual party belongs to the enrolment. Never infer it from a SIRET,
    // the learner identity or the funding mode.
    for (const enrolment of enrolments) {
      const partyError = validateContractingParty(enrolment);
      if (partyError) {
        const learner=enrolment.daily_learners??{};
        const name=[text(learner.first_name),text(learner.last_name)].filter(Boolean).join(" ")||"Cette inscription";
        return NextResponse.json({error:`${name} : ${partyError} Renseignez la partie contractante dans le dossier d’inscription de la session avant de préparer les documents.`,enrolment_id:enrolment.id},{status:400});
      }
      if(resolveContractingPartyType(enrolment) === "company" && !companies.some(row=>text(row.name) && text(row.name)===text(enrolment.company_name))) {
        return NextResponse.json({error:"Renseignez l’entreprise commanditaire de cette inscription dans les entreprises de la session."},{status:400});
      }
    }
    const applicableCompanies = companies.filter(row=>enrolments.some((e:any)=>text(e.company_name)===text(row.name)&&resolveContractingPartyType(e)==="company"));
    const companyEnrolmentIds = new Set(enrolments.filter((enrolment:any)=> {
      const company = companies.find(row=>text(row.name) && text(row.name)===text(enrolment.company_name));
      return resolveContractingPartyType(enrolment) === "company";
    }).map((enrolment:any)=>enrolment.id));
    // Snapshot every current pretraining document after validation. The cutover
    // happens only after the whole replacement pack has rendered, uploaded and
    // persisted successfully, so a partial failure cannot remove the last
    // canonical version.
    const contractualTypes = ["training_contract", "training_agreement"];
    const { data: sessionCurrentDocuments, error: currentDocumentsReadError } = await context.admin.from("daily_documents")
      .select("id,document_type,linked_object_type,linked_object_id,logical_name,metadata")
      .eq("organisation_id",context.organisationId).eq("session_id",sessionId)
      .in("document_type",[...documentTypes]).eq("is_current",true);
    if (currentDocumentsReadError) throw new Error(currentDocumentsReadError.message);
    // An individual pack never retires documents belonging to another
    // enrolment. Shared session documents are still reused.
    const currentDocuments = !targeted ? sessionCurrentDocuments : (sessionCurrentDocuments??[]).filter((document:any)=>
      document.linked_object_type==="session"
      || document.linked_object_type==="enrolment" && document.linked_object_id===enrolmentId
    );
    const contractualDocuments = (currentDocuments??[]).filter((document:any)=>
      contractualTypes.includes(document.document_type)
      && (!targeted
        || document.linked_object_type==="enrolment" && document.linked_object_id===enrolmentId
        || document.document_type==="training_agreement" && applicableCompanies.some(company=>text(document.metadata?.company_name)
          ? text(document.metadata.company_name)===text(company.name)
          : document.logical_name===`convention-${safe(text(company.name)||text(company.siret))}`))
    );
    const obsoleteDocumentIds = (contractualDocuments ?? []).filter((document:any)=> {
      if (document.document_type === "training_contract") {
        return document.linked_object_type === "enrolment" && companyEnrolmentIds.has(document.linked_object_id);
      }
      if (document.linked_object_type !== "session" || document.linked_object_id !== sessionId) return false;
      return !applicableCompanies.some(company=> {
        // Older conventions may have only their logical name as sponsor identity.
        if (!text(document.metadata?.company_name)) return document.logical_name === `convention-${safe(text(company.name)||text(company.siret))}`;
        return text(document.metadata.company_name) === text(company.name)
          && text(document.metadata.client_siret) === text(company.siret);
      });
    }).map((document:any)=>document.id);
    if(body.only_missing===true && obsoleteDocumentIds.length)return NextResponse.json({error:"Des documents existants concernent une autre partie contractante. Relisez ce dossier avant de les remplacer."},{status:409});
    const created:any[] = [];
    created.push(await generateDocument({ admin:context.admin,organisationId:context.organisationId,userId:actorUserId,documentType:"training_program",linkedObjectType:"session",linkedObjectId:sessionId,logicalName:"programme-session",filenameBase:`programme-${common.formationTitle}`,metadata:{session_id:sessionId,formation_id:session.formation_id},html:buildTrainingProgramHtml(common,{globalObjective:text(formation.global_objective),learningObjectives:asArray(formation.learning_objectives),targetAudience:text(formation.target_audience),prerequisites:text(formation.prerequisites),durationHours:text(formation.duration_hours),durationDays:text(formation.duration_days),detailedProgram:text(formation.detailed_program),pedagogicalMethods:text(formation.pedagogical_methods),pedagogicalResources:text(formation.pedagogical_resources),evaluationMethods:text(formation.evaluation_methods),accessibility:text(formation.accessibility)}) }));
    created.push(await generateDocument({admin:context.admin,organisationId:context.organisationId,userId:actorUserId,documentType:"welcome_booklet",linkedObjectType:"session",linkedObjectId:sessionId,logicalName:"livret-accueil-session",filenameBase:"livret-accueil",metadata:{session_id:sessionId,formation_id:session.formation_id},html:buildWelcomeBookletHtml(common,{registrationMethods:text(formation.registration_methods),accessDelays:text(formation.access_delays),accessibility:text(formation.accessibility)})}));
    created.push(await generateDocument({admin:context.admin,organisationId:context.organisationId,userId:actorUserId,documentType:"internal_regulations",linkedObjectType:"session",linkedObjectId:sessionId,logicalName:"reglement-interieur-session",filenameBase:"reglement-interieur",metadata:{session_id:sessionId,formation_id:session.formation_id},html:buildInternalRegulationsHtml(common)}));
    for (const company of applicableCompanies) {
      const learnerNames=sessionEnrolments.filter((e:any)=>text(e.company_name)===text(company.name)&&resolveContractingPartyType(e)==="company").map((e:any)=>`${text(e.daily_learners?.first_name)} ${text(e.daily_learners?.last_name)}`.trim()).filter(Boolean).join("\n");
      created.push(await generateDocument({admin:context.admin,organisationId:context.organisationId,userId:actorUserId,deferRetirement:true,documentType:"training_agreement",linkedObjectType:"session",linkedObjectId:sessionId,logicalName:`convention-${safe(text(company.name)||text(company.siret))}`,filenameBase:`convention-${text(company.name)||common.formationTitle}`,metadata:{session_id:sessionId,formation_id:session.formation_id,company_name:text(company.name),client_siret:text(company.siret),contractual_kind:"convention"},html:buildTrainingAgreementHtml(common,{clientName:text(company.name),clientAddress:text(company.address),clientSiret:text(company.siret),representative:text(company.contact_name),learnerNames,price:text(formation.price),objective:text(formation.global_objective),prerequisites:text(formation.prerequisites),evaluation:text(formation.evaluation_methods)})}));
    }
    const needsMap = new Map(needs.map((n:any)=>[n.enrolment_id,n]));
    for (const enrolment of enrolments) {
      const learner = enrolment.daily_learners ?? {};
      const learnerName = `${text(learner.first_name)} ${text(learner.last_name)}`.trim();
      const need:any = needsMap.get(enrolment.id);
      const company = companies.find((row)=>text(row.name) && text(row.name)===text(enrolment.company_name));
      if (resolveContractingPartyType(enrolment) === "individual") created.push(await generateDocument({admin:context.admin,organisationId:context.organisationId,userId:actorUserId,deferRetirement:true,documentType:"training_contract",linkedObjectType:"enrolment",linkedObjectId:enrolment.id,logicalName:"contrat-formation-apprenant",filenameBase:`contrat-${learnerName}`,metadata:{session_id:sessionId,formation_id:session.formation_id,enrolment_id:enrolment.id,learner_id:enrolment.learner_id,learner_name:learnerName,contractual_kind:"individual_contract"},html:buildTrainingContractHtml(common,{learnerName,learnerEmail:text(learner.email),price:text(formation.price),objective:text(formation.global_objective),prerequisites:text(formation.prerequisites),evaluation:text(formation.evaluation_methods)})}));
      created.push(await generateDocument({admin:context.admin,organisationId:context.organisationId,userId:actorUserId,documentType:"convocation",linkedObjectType:"enrolment",linkedObjectId:enrolment.id,logicalName:"convocation-apprenant",filenameBase:`convocation-${learnerName}`,metadata:{session_id:sessionId,formation_id:session.formation_id,enrolment_id:enrolment.id,learner_id:enrolment.learner_id,learner_name:learnerName},html:buildConvocationHtml(common,{learnerName,learnerEmail:text(learner.email),trainerNames,usefulInfo:need?.planned_accommodations ? `Adaptation prévue : ${text(need.planned_accommodations)}` : ""})}));
      created.push(await generateDocument({admin:context.admin,organisationId:context.organisationId,userId:actorUserId,documentType:"registration_positioning",linkedObjectType:"enrolment",linkedObjectId:enrolment.id,logicalName:"inscription-positionnement",filenameBase:`inscription-positionnement-${learnerName}`,metadata:{session_id:sessionId,formation_id:session.formation_id,enrolment_id:enrolment.id,learner_id:enrolment.learner_id,learner_name:learnerName},html:buildRegistrationPositioningHtml(common,{learnerName,learnerEmail:text(learner.email),companyName:text(enrolment.company_name || learner.company_name),funding:[text(enrolment.funding_type),text(enrolment.funding_organisation)].filter(Boolean).join(" · "),prerequisites:text(formation.prerequisites),positioningStatus:text(enrolment.positioning_status),prerequisiteStatus:text(enrolment.prerequisites_status),supportNeeds:need?.has_specific_needs ? [text(need.needs_description),text(need.planned_accommodations)].filter(Boolean).join("\n") : ""})}));
    }
    // No retirement on validation, rendering, upload or generation failure.
    // Updating currency alone preserves signed content, status and signature evidence.
    // Include every current version from before this attempt, including failed retries.
    const createdIds = new Set(created.map(document=>document.id));
    const replacedDocumentIds = (currentDocuments ?? []).filter((document:any)=>created.some(replacement=>
      replacement.document_type === document.document_type
      && replacement.linked_object_type === document.linked_object_type
      && replacement.linked_object_id === document.linked_object_id
      && replacement.logical_name === document.logical_name
    )).map((document:any)=>document.id);
    const retireDocumentIds = [...new Set([...obsoleteDocumentIds,...replacedDocumentIds])].filter(id=>!createdIds.has(id));
    if (retireDocumentIds.length) {
      const { error: retirementError } = await context.admin.from("daily_documents")
        .update({is_current:false,updated_by:actorUserId})
        .eq("organisation_id",context.organisationId).eq("session_id",sessionId)
        .in("document_type",[...documentTypes]).eq("is_current",true).in("id",retireDocumentIds);
      if (retirementError) throw new Error(retirementError.message);
    }
    if(context.assisted && context.assistance)await logAgentAssistanceAction({supabase:context.admin,req,assistance:context.assistance,action:"pretraining_documents_prepared",actionLabel:"Préparation documentaire avant formation",metadata:{session_id:sessionId,enrolment_id:enrolmentId||null,document_ids:created.map(doc=>doc.id)}});
    return NextResponse.json({documents:created,count:created.length,enrolment_id:enrolmentId||null});
  } catch (cause) {
    return NextResponse.json({error:cause instanceof Error ? cause.message : "Génération impossible."},{status:400});
  }
}
