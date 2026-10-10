import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { ensureAndSendLearnerPortalAccess } from "@/lib/server/dailyLearnerPortalAccess";
import { validateContractingParty } from "@/lib/dailyContractingParty";
import { logAgentAssistanceAction } from "@/lib/server/agentAssistance";

const email = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Inscription groupée d'apprenants existants : une inscription et un accès par personne. */
export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions", { allowAssistanceWrite: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const sessionId = text(body.session_id);
  const learnerIds: unknown[] = body.learner_ids;
  const partyError = validateContractingParty(body);
  if (partyError) return NextResponse.json({ error: partyError }, { status: 400 });
  if (!UUID.test(sessionId) || !Array.isArray(learnerIds) || learnerIds.length < 1 || learnerIds.length > 30 ||
    learnerIds.some(id => typeof id !== "string" || !UUID.test(id)) || new Set(learnerIds).size !== learnerIds.length) {
    return NextResponse.json({ error: "Sélectionnez de 1 à 30 apprenants distincts et une session valide." }, { status: 400 });
  }
  const admin = context.admin;
  const [{ data: session, error: sessionError }, { data: learners, error: learnersError }] = await Promise.all([
    admin.from("daily_sessions").select("id").eq("id", sessionId).eq("organisation_id", context.organisationId).maybeSingle(),
    admin.from("daily_learners").select("id,email").eq("organisation_id", context.organisationId).in("id", learnerIds),
  ]);
  if (sessionError || learnersError) return NextResponse.json({ error: "Vérification des apprenants impossible." }, { status: 500 });
  if (!session || (learners ?? []).length !== learnerIds.length) return NextResponse.json({ error: "Session ou apprenant extérieur à votre organisme." }, { status: 404 });
  const missingEmail = (learners ?? []).find(learner => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email(learner.email)));
  if (missingEmail) return NextResponse.json({ error: "Chaque apprenant doit avoir un email valide avant l'envoi des accès.", learnerId: missingEmail.id }, { status: 400 });
  const results: Array<{ learnerId: string; status: string; enrolmentId?: string; accessStatus?: string }> = [];
  for (const learnerId of learnerIds as string[]) {
    const { data: existing, error: lookupError } = await admin.from("daily_session_enrolments")
      .select("id").eq("organisation_id", context.organisationId).eq("session_id", sessionId).eq("learner_id", learnerId).maybeSingle();
    if (lookupError) return NextResponse.json({ error: "Vérification des doublons impossible.", results }, { status: 500 });
    if (existing) { results.push({ learnerId, status: "already_enrolled", enrolmentId: existing.id }); continue; }
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
      });
      accessStatus = access.status;
    } catch (error) { console.error("Daily : accès apprenant collectif non envoyé", error); }
    results.push({ learnerId, status: "created", enrolmentId: enrolment.id, accessStatus });
  }
  if (context.assisted && context.assistance) await logAgentAssistanceAction({
    supabase: admin, req, assistance: context.assistance,
    action: "daily_bulk_enrolment_create", actionLabel: "Inscription collective pour l'OF",
    newState: { session_id: sessionId, results },
  });
  return NextResponse.json({
    results, created: results.filter(result => result.status === "created").length,
    alreadyEnrolled: results.filter(result => result.status === "already_enrolled").length,
    failed: results.filter(result => result.status === "failed" || result.accessStatus === "send_failed").length,
  });
}
