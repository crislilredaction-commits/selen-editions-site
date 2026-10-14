import { NextResponse } from "next/server";
import type { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { validateContractingParty } from "@/lib/dailyContractingParty";
import { delegatedRegistrationTokenHash, getDelegatedRegistrationActor } from "@/lib/server/dailyDelegatedRegistrationDecision";

type Context = Extract<Awaited<ReturnType<typeof getDailyOrganisationContext>>, {ok:true}>;
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

// Narrow Studio operation: no status/decision, identity, funding or access change.
export async function updateDelegatedContractingParty(req: Request, context: Context, body: Record<string, unknown>) {
  if (!context.assisted || !context.assistance) return NextResponse.json({error:"Délégation Studio valide requise."}, {status:403});
  if (body.confirm_delegated !== true || !clean(body.id) || !clean(body.session_id) || !clean(body.expected_updated_at) || !Number.isFinite(Date.parse(clean(body.expected_updated_at)))) return NextResponse.json({error:"Inscription, confirmation et version ouverte requises."}, {status:400});
  const choice = {contracting_party_type:body.contracting_party_type, company_name:body.contracting_party_type === "company" ? clean(body.company_name) : null};
  const partyError = validateContractingParty(choice);
  if (partyError) return NextResponse.json({error:partyError}, {status:400});
  let agentUserId: string;
  try {
    agentUserId = getDelegatedRegistrationActor(context.assistance, context.organisationId).agentUserId;
    const check = await context.admin.rpc("daily_assert_document_delegation", {p_assistance_id:context.assistance.id, p_token_hash:delegatedRegistrationTokenHash(req), p_organisation_id:context.organisationId});
    if (check.error || check.data !== agentUserId) throw new Error("Invalid delegation");
  } catch { return NextResponse.json({error:"Délégation invalide, expirée ou agent désactivé."}, {status:403}); }
  const {data:existing, error:readError} = await context.admin.from("daily_session_enrolments").select("*")
    .eq("id",clean(body.id)).eq("session_id",clean(body.session_id)).eq("organisation_id",context.organisationId).maybeSingle();
  if (readError) return NextResponse.json({error:"Lecture de l’inscription indisponible."}, {status:500});
  if (!existing) return NextResponse.json({error:"Inscription introuvable."}, {status:404});
  if (["declined", "cancelled", "abandoned"].includes(existing.status)) return NextResponse.json({error:"Cette inscription n’est plus active."}, {status:409});
  if (existing.updated_at !== body.expected_updated_at) return NextResponse.json({error:"L’inscription a changé. Rechargez et vérifiez le choix actuel."}, {status:409});
  const {data:session, error:sessionError} = await context.admin.from("daily_sessions").select("id,status,companies")
    .eq("id",existing.session_id).eq("organisation_id",context.organisationId).maybeSingle();
  if (sessionError) return NextResponse.json({error:"Lecture de la session indisponible."}, {status:500});
  if (!session || ["archived", "cancelled"].includes(session.status)) return NextResponse.json({error:"Session inaccessible."}, {status:404});
  if (choice.contracting_party_type === "company" && !(Array.isArray(session.companies) && session.companies.some((company: {name?:string}) => clean(company.name) === choice.company_name))) return NextResponse.json({error:"Choisissez une entreprise commanditaire enregistrée dans la session."}, {status:400});
  if (existing.contracting_party_type === choice.contracting_party_type && (existing.company_name || null) === choice.company_name) return NextResponse.json({enrolment:existing});
  const {data:documents, error:documentError} = await context.admin.from("daily_documents")
    .select("linked_object_type,linked_object_id,document_type,metadata")
    .eq("organisation_id",context.organisationId).eq("session_id",existing.session_id).eq("is_current",true)
    .in("document_type",["training_contract","training_agreement"]).not("status","eq","archived");
  if (documentError) return NextResponse.json({error:"Vérification des documents existants indisponible."}, {status:500});
  if ((documents ?? []).some(document => document.linked_object_type === "enrolment" && document.linked_object_id === existing.id || document.document_type === "training_agreement" && existing.contracting_party_type === "company" && clean(document.metadata?.company_name) === clean(existing.company_name))) return NextResponse.json({error:"Un document contractuel existe déjà pour cette inscription. Faites relire le dossier avant de changer la partie contractante."}, {status:409});
  const before = {enrolment_id:existing.id, session_id:existing.session_id, contracting_party_type:existing.contracting_party_type, company_name:existing.company_name, updated_at:existing.updated_at};
  const after = {...before, ...choice, updated_at:new Date().toISOString()};
  // Persist the actual agent and requested change before any business write.
  // A failed/conflicting write remains an attempted action, never an applied one.
  const {data:audit, error:auditError} = await context.admin.from("selen_agent_assistance_logs").insert({
    assistance_token_id:context.assistance.id, agent_user_id:agentUserId, agent_email:context.assistance.agent_email,
    organisation_id:context.organisationId, dossier_id:null, action:"daily_enrolment_contracting_party_requested",
    action_label:"Choix de partie contractante demandé dans Studio", old_state:before, new_state:after,
    metadata:{mode:"agent_assistance", phase:"requested", session_id:existing.session_id, enrolment_id:existing.id},
  }).select("id").single();
  if (auditError || !audit) return NextResponse.json({error:"La traçabilité est indisponible. Aucun choix n’a été enregistré."}, {status:503});
  const {data, error} = await context.admin.from("daily_session_enrolments").update({...choice, updated_at:after.updated_at})
    .eq("id",existing.id).eq("session_id",existing.session_id).eq("organisation_id",context.organisationId)
    .eq("updated_at",body.expected_updated_at).eq("status",existing.status).select("*").maybeSingle();
  if (error) return NextResponse.json({error:"Le choix n’a pas pu être enregistré. Rechargez le dossier."}, {status:500});
  if (!data) return NextResponse.json({error:"L’inscription a changé. Rechargez et vérifiez le choix actuel."}, {status:409});
  const finalAudit = await context.admin.from("selen_agent_assistance_logs").update({action:"daily_enrolment_contracting_party_update", action_label:"Partie contractante enregistrée dans Studio", new_state:{...after, updated_at:data.updated_at}, metadata:{mode:"agent_assistance", phase:"applied", session_id:existing.session_id, enrolment_id:existing.id}})
    .eq("id",audit.id).eq("agent_user_id",agentUserId).select("id").maybeSingle();
  if (finalAudit.error || !finalAudit.data) return NextResponse.json({error:"Le choix est enregistré, mais la clôture du journal n’est pas confirmée. Rechargez le dossier et contactez Selen.", saved:true, enrolment:data}, {status:503});
  return NextResponse.json({enrolment:data});
}
