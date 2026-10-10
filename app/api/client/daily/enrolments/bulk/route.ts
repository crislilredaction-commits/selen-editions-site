import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { ensureAndSendLearnerPortalAccess } from "@/lib/server/dailyLearnerPortalAccess";
import { validateContractingParty } from "@/lib/dailyContractingParty";
import { logAgentAssistanceAction } from "@/lib/server/agentAssistance";

const email = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Inscription groupée d'apprenants existants ou nouveaux : une inscription et un accès par personne. */
export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions", { allowAssistanceWrite: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const sessionId = text(body.session_id);
  const learnerIds: unknown[] = body.learner_ids;
  const newLearners: unknown[] = body.new_learners ?? [];
  const partyError = validateContractingParty(body);
  if (partyError) return NextResponse.json({ error: partyError }, { status: 400 });
  if (!UUID.test(sessionId) || !Array.isArray(learnerIds) || !Array.isArray(newLearners) || learnerIds.length + newLearners.length < 1 || learnerIds.length + newLearners.length > 30 ||
    learnerIds.some(id => typeof id !== "string" || !UUID.test(id)) || new Set(learnerIds).size !== learnerIds.length) {
    return NextResponse.json({ error: "Sélectionnez de 1 à 30 apprenants distincts et une session valide." }, { status: 400 });
  }
  const proposed = newLearners.map(value => value && typeof value === "object" ? value as Record<string, unknown> : {});
  if (proposed.some(row => !text(row.first_name) || !text(row.last_name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email(row.email)))) {
    return NextResponse.json({ error: "Chaque nouveau salarié doit avoir un prénom, un nom et un email valide." }, { status: 400 });
  }
  const proposedEmails = proposed.map(row => email(row.email));
  if (new Set(proposedEmails).size !== proposedEmails.length) {
    return NextResponse.json({ error: "Emails en double parmi les nouveaux salariés." }, { status: 400 });
  }
  const admin = context.admin;
  const [{ data: session, error: sessionError }, { data: learners, error: learnersError }] = await Promise.all([
    admin.from("daily_sessions").select("id").eq("id", sessionId).eq("organisation_id", context.organisationId).maybeSingle(),
    learnerIds.length ? admin.from("daily_learners").select("id,email").eq("organisation_id", context.organisationId).in("id", learnerIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (sessionError || learnersError) return NextResponse.json({ error: "Vérification des apprenants impossible." }, { status: 500 });
  if (!session || (learners ?? []).length !== learnerIds.length) return NextResponse.json({ error: "Session ou apprenant extérieur à votre organisme." }, { status: 404 });
  const existingByEmail = new Map<string, { id: string; first_name: string; last_name: string }>();
  if (proposedEmails.length) {
    const { data: duplicates, error: duplicateError } = await admin.from("daily_learners").select("id,email,first_name,last_name")
      .eq("organisation_id", context.organisationId).in("email", proposedEmails);
    if (duplicateError) return NextResponse.json({ error: "Vérification des emails impossible." }, { status: 500 });
    for (const person of duplicates ?? []) existingByEmail.set(email(person.email), person);
  }
  if ((learners ?? []).some(learner => proposedEmails.includes(email(learner.email)))) {
    return NextResponse.json({ error: "Un salarié est présent à la fois dans la sélection et les nouveaux profils." }, { status: 409 });
  }
  const missingEmail = (learners ?? []).find(learner => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email(learner.email)));
  if (missingEmail) return NextResponse.json({ error: "Chaque apprenant doit avoir un email valide avant l'envoi des accès.", learnerId: missingEmail.id }, { status: 400 });
  const results: Array<{ learnerId: string; status: string; enrolmentId?: string; accessStatus?: string }> = [];
  const resolvedIds = [...learnerIds as string[]];
  const creationFailures: string[] = [];
  for (const row of proposed) {
    const reused = existingByEmail.get(email(row.email));
    if (reused) {
      if (text(reused.first_name).toLowerCase() !== text(row.first_name).toLowerCase() || text(reused.last_name).toLowerCase() !== text(row.last_name).toLowerCase()) {
        creationFailures.push(email(row.email));
        continue;
      }
      if (!resolvedIds.includes(reused.id)) resolvedIds.push(reused.id);
      continue;
    }
    const { data: learner, error: createError } = await admin.from("daily_learners").insert({
      organisation_id: context.organisationId, first_name: text(row.first_name),
      last_name: text(row.last_name), email: email(row.email),
      phone: text(row.phone) || null, company_name: text(body.company_name),
      job_title: text(row.job_title) || null, created_by: context.user.id,
    }).select("id").single();
    if (createError || !learner) creationFailures.push(email(row.email));
    else resolvedIds.push(learner.id);
  }
  for (const learnerId of resolvedIds) {
    const { data: existing, error: lookupError } = await admin.from("daily_session_enrolments")
      .select("id").eq("organisation_id", context.organisationId).eq("session_id", sessionId).eq("learner_id", learnerId).maybeSingle();
    if (lookupError) { results.push({ learnerId, status: "failed" }); continue; }
    if (existing) {
      let accessStatus = "send_failed";
      try {
        const access = await ensureAndSendLearnerPortalAccess(admin, {
          enrolmentId: existing.id, origin: new URL(req.url).origin,
          createdBy: context.user.id, source: "manual_enrolment",
          organisationId: context.organisationId,
        });
        accessStatus = access.status;
      } catch (error) { console.error("Daily : vérification accès apprenant existant impossible", error); }
      results.push({ learnerId, status: "already_enrolled", enrolmentId: existing.id, accessStatus });
      continue;
    }
    const { data: enrolment, error: insertError } = await admin.from("daily_session_enrolments").insert({
      organisation_id: context.organisationId, session_id: sessionId, learner_id: learnerId,
      contracting_party_type: body.contracting_party_type, status: "pending",
      funding_type: "employer", company_name: text(body.company_name) || null,
      company_contact_name: text(body.company_contact_name) || null,
      company_contact_email: email(body.company_contact_email) || null,
      created_by: context.user.id,
    }).select("id").single();
    if (insertError || !enrolment) {
      results.push({ learnerId, status: insertError?.code === "23505" ? "already_enrolled" : "failed" });
      continue;
    }
    let accessStatus = "send_failed";
    try {
      const access = await ensureAndSendLearnerPortalAccess(admin, {
        enrolmentId: enrolment.id, origin: new URL(req.url).origin,
        createdBy: context.user.id, source: "manual_enrolment",
        organisationId: context.organisationId,
      });
      accessStatus = access.status;
    } catch (error) { console.error("Daily : accès apprenant collectif non envoyé", error); }
    results.push({ learnerId, status: "created", enrolmentId: enrolment.id, accessStatus });
  }
  if (context.assisted && context.assistance) await logAgentAssistanceAction({
    supabase: admin, req, assistance: context.assistance,
    action: "daily_bulk_enrolment_create", actionLabel: "Inscription collective pour l'OF",
    newState: { session_id: sessionId, results, creationFailures },
  });
  return NextResponse.json({
    results, creationFailures, created: results.filter(result => result.status === "created").length,
    alreadyEnrolled: results.filter(result => result.status === "already_enrolled").length,
    failed: results.filter(result => result.status === "failed" || result.accessStatus === "send_failed").length + creationFailures.length,
    accessFailed: results.filter(result => result.accessStatus === "send_failed").map(result => ({ learnerId: result.learnerId, enrolmentId: result.enrolmentId })),
  });
}
