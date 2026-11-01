import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";
import { assertDelegatedRegistrationDecision, delegatedRegistrationTokenHash, getDelegatedRegistrationActor, registrationAssistanceToken } from "@/lib/server/dailyDelegatedRegistrationDecision";
import type { AgentAssistanceContext } from "@/lib/server/agentAssistance";
import { sendLearnerPortalAccessForRegistrationRequest } from "@/lib/server/dailyLearnerPortalAccess";
import { sendEnterprisePortalAccessForRegistrationRequest } from "@/lib/server/dailyEnterprisePortalAccess";

type DecisionStatus = "pending" | "ready_for_of" | "accepted" | "refused";
type ActorType = "organisation" | "studio_agent";
type Decision = "accepted" | "refused";

type FormationRow = { id: string; organisation_id: string; title: string; status?: string; previous_version_id?: string | null; allowed_trainer_ids?: unknown };
type SessionRow = { id: string; formation_id: string; internal_reference?: string | null; start_date?: string | null; end_date?: string | null; status?: string | null };
type DecisionHistoryRow = { id: string; registration_request_id: string; actor_type: string; actor_user_id: string; decision: string; comment?: string | null; decided_at: string; trainer_profile_id?: string | null; actor_label: string | null };
type RequestRow = {
  id: string;
  formation_id: string;
  response_type: "beneficiary" | "company";
  respondent_first_name?: string | null;
  respondent_last_name?: string | null;
  respondent_email?: string | null;
  company_name?: string | null;
  participants?: unknown;
  adaptation_needed?: boolean | null;
  submitted_at?: string | null;
  attached_session_id?: string | null;
  materialized_at?: string | null;
  status: string;
  decision_status: DecisionStatus;
  accepted_at?: string | null;
  agent_review_requested_at?: string | null;
  agent_analysis_completed_at?: string | null;
  agent_analysis_summary?: Record<string, unknown> | null;
  positioning_answers?: unknown;
};

function jsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function applicantLabel(row: RequestRow) {
  const person = [row.respondent_first_name, row.respondent_last_name].filter(Boolean).join(" ").trim();
  return row.company_name?.trim() || person || row.respondent_email?.trim() || "Candidat";
}
function positioningResponses(value: unknown) {
  const answers = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (answers.mode !== "selen" || !Array.isArray(answers.questions)) return [];
  return answers.questions.map((raw, index) => {
    const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const values = Array.isArray(row.answer) ? row.answer : [row.answer];
    const lines = values.filter(value => typeof value === "string" || typeof value === "number" || typeof value === "boolean").map(value => String(value).trim()).filter(Boolean);
    return { label: typeof row.label === "string" && row.label.trim() ? row.label : `Question ${index + 1}`, lines };
  });
}
async function getAccess() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return context;
  const admin = getAdminSupabase();
  const organisationId = context.workspace.membership.organisation_id;
  const roles = context.workspace.membership.roles ?? [];
  const isManager = roles.includes("manager");
  const { data: trainerProfile, error: trainerError } = await admin
    .from("daily_trainer_profiles")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("user_id", context.user.id)
    .eq("active", true)
    .not("status", "in", "(rejected,archived)")
    .maybeSingle();
  if (trainerError) throw new Error(trainerError.message);
  return { ok: true as const, user: context.user, organisationId, isManager, trainerProfileId: trainerProfile?.id ?? null, admin };
}

type RegistrationAccess = { ok: true; admin: ReturnType<typeof getAdminSupabase>; organisationId: string; user: { id: string } };

async function provisionLearnerAccess(access: RegistrationAccess, requestId: string, req: Request) {
  if (!access.ok) return [];
  try {
    return await sendLearnerPortalAccessForRegistrationRequest(access.admin, {
      registrationRequestId: requestId,
      organisationId: access.organisationId,
      origin: new URL(req.url).origin,
      createdBy: access.user.id,
    });
  } catch (cause) {
    console.error("Daily : inscription créée mais accès apprenant non finalisé", cause);
    return [{ enrolmentId: "", status: "send_failed" as const }];
  }
}

async function provisionEnterpriseAccess(access: RegistrationAccess, requestId: string, sessionId: string | null, req: Request) {
  if (!access.ok) return [];
  try {
    const { data: requestScope, error: requestScopeError } = await access.admin
      .from("daily_formation_registration_requests")
      .select("formation_id,attached_session_id")
      .eq("id", requestId)
      .maybeSingle();
    if (requestScopeError || !requestScope) return [];
    const resolvedSessionId = sessionId || requestScope.attached_session_id || null;
    if (!resolvedSessionId) return [];
    const { data: sessionScope, error: sessionScopeError } = await access.admin
      .from("daily_sessions")
      .select("organisation_id,formation_id")
      .eq("id", resolvedSessionId)
      .maybeSingle();
    if (sessionScopeError || !sessionScope || sessionScope.organisation_id !== access.organisationId || sessionScope.formation_id !== requestScope.formation_id) {
      console.error("Daily : tentative d’accès entreprise hors périmètre de l’organisme");
      return [];
    }
    return await sendEnterprisePortalAccessForRegistrationRequest(access.admin, {
      registrationRequestId: requestId,
      sessionId: resolvedSessionId,
      origin: new URL(req.url).origin,
      createdBy: access.user.id,
    });
  } catch (cause) {
    console.error("Daily : inscription entreprise validée mais accès entreprise non finalisé", cause);
    return [];
  }
}

async function provisionAcceptedAccesses(access: RegistrationAccess, requestId: string, sessionId: string | null, req: Request) {
  const [learnerAccess, enterpriseAccess] = await Promise.all([
    provisionLearnerAccess(access, requestId, req),
    provisionEnterpriseAccess(access, requestId, sessionId, req),
  ]);
  return { learnerAccess, enterpriseAccess };
}

export async function GET(req: Request) {
  try {
    const readContext = await getDailyOrganisationReadContext(req, ["sessions", "trainings"]);
    if (!readContext.ok) return NextResponse.json({ error: readContext.error }, { status: readContext.status });
    const assisted = readContext.assisted;
    if (registrationAssistanceToken(req) && !assisted) return NextResponse.json({ error: "Délégation Studio invalide ou expirée." }, { status: 403 });
    if (assisted) {
      try {
        if (!readContext.assistance) throw new Error("Délégation Studio manquante.");
        getDelegatedRegistrationActor(readContext.assistance, readContext.organisationId);
      } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Délégation invalide." }, { status: 403 }); }
    }
    const access = assisted
      ? { ok: true as const, admin: readContext.admin, organisationId: readContext.organisationId, user: readContext.user, isManager: false }
      : await getAccess();
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    if (!assisted && !access.isManager) return NextResponse.json({ error: "Accès réservé au responsable de l’organisme." }, { status: 403 });

    const { data: formations, error: formationError } = await access.admin
      .from("daily_formations")
      .select("id,organisation_id,title,status,allowed_trainer_ids,previous_version_id")
      .eq("organisation_id", access.organisationId);
    if (formationError) throw new Error(formationError.message);
    const visibleFormations = ((formations ?? []) as FormationRow[]);
    const formationIds = visibleFormations.map((formation) => formation.id);
    if (!formationIds.length) return NextResponse.json({ requests: [], sessions: [], actor_types: assisted ? ["studio_agent"] : ["organisation"], read_only: false, assisted });

    const [{ data: requests, error: requestError }, { data: sessions, error: sessionError }] = await Promise.all([
      access.admin.from("daily_formation_registration_requests")
        .select("id,formation_id,response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,participants,adaptation_needed,submitted_at,attached_session_id,materialized_at,status,decision_status,accepted_at,agent_review_requested_at,agent_analysis_completed_at,agent_analysis_summary,positioning_answers")
        .in("formation_id", formationIds).neq("status", "archived").order("submitted_at", { ascending: false }),
      (access.isManager || assisted)
        ? access.admin.from("daily_sessions").select("id,formation_id,internal_reference,start_date,end_date,status").eq("organisation_id", access.organisationId).in("formation_id", formationIds).not("status", "in", "(archived,cancelled)").order("start_date", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (requestError || sessionError) throw new Error(requestError?.message ?? sessionError?.message ?? "Chargement impossible.");

    // Historical sessions may belong to an archived version of the same programme.
    // Discovery is read-only: the existing decision RPC must still enforce formation scope.
    const { data: historicalFormations, error: historicalFormationError } = await access.admin
      .from("daily_formations").select("id,title,status,previous_version_id,version")
      .eq("organisation_id", access.organisationId).eq("status", "archived");
    if (historicalFormationError) throw new Error(historicalFormationError.message);
    const activeTitles = new Set(visibleFormations.map(formation => formation.title.trim().toLocaleLowerCase("fr")));
    // Only direct predecessors of an active version qualify for reconciliation discovery.
    // A matching title alone is not evidence that two programmes are related.
    const activePredecessorIds = new Set(visibleFormations.map(formation => (formation as FormationRow & { previous_version_id?: string | null }).previous_version_id).filter(Boolean));
    const historicalCandidates = (historicalFormations ?? []).filter(formation => activePredecessorIds.has(formation.id) && activeTitles.has(String(formation.title ?? "").trim().toLocaleLowerCase("fr")));
    const historicalIds = historicalCandidates.map(formation => formation.id);
    const { data: historicalSessions, error: historicalSessionError } = historicalIds.length
      ? await access.admin.from("daily_sessions").select("id,formation_id,internal_reference,start_date,end_date,status")
          .eq("organisation_id", access.organisationId).in("formation_id", historicalIds)
          .not("status", "in", "(archived,cancelled)").order("start_date", { ascending: false })
      : { data: [], error: null };
    if (historicalSessionError) throw new Error(historicalSessionError.message);

    const requestRows = (requests ?? []) as RequestRow[];
    const requestIds = requestRows.map((row) => row.id);
    const [{ data: decisions, error: decisionError }, { data: materializations, error: materializationError }] = requestIds.length
      ? await Promise.all([
          access.admin.from("daily_registration_request_decisions").select("id,registration_request_id,actor_type,actor_user_id,decision,comment,decided_at,trainer_profile_id,delegation_context").in("registration_request_id", requestIds).order("decided_at", { ascending: false }),
          access.admin.from("daily_registration_request_enrolments").select("registration_request_id,enrolment_id").in("registration_request_id", requestIds),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (decisionError || materializationError) throw new Error(decisionError?.message ?? materializationError?.message ?? "Chargement impossible.");

    const formationById = new Map(visibleFormations.map((formation) => [formation.id, formation]));
    const decisionsByRequest = new Map<string, DecisionHistoryRow[]>();
    for (const decision of decisions ?? []) {
      const current = decisionsByRequest.get(decision.registration_request_id) ?? [];
      const { delegation_context, ...visibleDecision } = decision;
      current.push({ ...visibleDecision, actor_label: typeof delegation_context?.actor_label === "string" ? delegation_context.actor_label : null });
      decisionsByRequest.set(decision.registration_request_id, current);
    }
    const materializedCount = new Map<string, number>();
    for (const row of materializations ?? []) materializedCount.set(row.registration_request_id, (materializedCount.get(row.registration_request_id) ?? 0) + 1);

    // Return verified files and readable Selen answers, without technical proofs.
    const proofsFor = (row: RequestRow) => {
      const answers = row.positioning_answers as Record<string, unknown> | null;
      return answers?.mode === "off_platform" && Array.isArray(answers.external_documents)
        ? answers.external_documents.filter((proof): proof is Record<string, unknown> => Boolean(proof && typeof proof === "object" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(proof.document_id ?? "")))) : [];
    };
    const proofIds = [...new Set(requestRows.flatMap(row => proofsFor(row).map(proof => String(proof.document_id))))];
    const { data: proofDocuments, error: proofError } = proofIds.length
      ? await access.admin.from("daily_documents").select("id,organisation_id,formation_id,document_type,linked_object_type,linked_object_id,enrolment_id,bucket,storage_path,sha256,metadata")
          .eq("organisation_id", access.organisationId).in("formation_id", formationIds).in("id", proofIds).neq("status", "archived")
      : { data: [], error: null };
    if (proofError) throw new Error("Lecture des documents de positionnement impossible.");
    const documentsById = new Map((proofDocuments ?? []).map(document => [document.id, document]));

    const actorTypes: ActorType[] = [];
    if (access.isManager && !assisted) actorTypes.push("organisation");
    if (assisted) actorTypes.push("studio_agent");
    return NextResponse.json({
      actor_types: actorTypes,
      read_only: false,
      assisted,
      sessions: (sessions ?? []) as SessionRow[],
      historical_sessions: (historicalSessions ?? []).map(session => ({ ...session, formation_title: historicalCandidates.find(formation => formation.id === session.formation_id)?.title ?? "Formation archivée", source_formation_ids: visibleFormations.filter(formation => formation.previous_version_id === session.formation_id).map(formation => formation.id), requires_reconciliation: true })),
      requests: requestRows.map((row) => {
        const { positioning_answers, ...visible } = row;
        const answers = positioning_answers as Record<string, unknown> | null;
        const positioning_documents = proofsFor(row).flatMap(proof => {
          const document = documentsById.get(String(proof.document_id));
          const metadata = document?.metadata as Record<string, unknown> | null;
          const scopeMatches = document?.document_type === "positioning_application_evidence"
            ? document.linked_object_type === "registration_request" && document.linked_object_id === row.id
            : document?.document_type === "positioning_evidence" && metadata?.source_request_id === row.id && metadata?.source_request_kind === "formation"
              && document.linked_object_type === "enrolment" && document.linked_object_id === document.enrolment_id
              && (materializations ?? []).some(mapping => mapping.registration_request_id === row.id && mapping.enrolment_id === document.enrolment_id);
          if (!document || !scopeMatches || document.formation_id !== row.formation_id || document.bucket !== "documents" || !document.storage_path.startsWith(`daily/${access.organisationId}/`)
            || document.sha256 !== proof.sha256 || metadata?.source !== "daily_own_positioning" || metadata?.source_document_id !== answers?.source_document_id || metadata?.submission_fingerprint !== answers?.submission_fingerprint) return [];
          return [{ id: document.id, name: String(metadata.original_filename || "Positionnement rempli") }];
        });
        return {
        ...visible,
        positioning_documents,
        positioning_responses: positioningResponses(positioning_answers),
        applicant_label: applicantLabel(row),
        formation_title: formationById.get(row.formation_id)?.title ?? "Formation",
        decisions: decisionsByRequest.get(row.id) ?? [],
        can_decide: row.decision_status === "ready_for_of",
        can_materialize: (assisted || access.isManager) && row.decision_status === "accepted" && !row.materialized_at,
        can_retry_access: (assisted || access.isManager) && row.decision_status === "accepted",
        read_only: false,
        delegated: assisted,
        materialized_count: materializedCount.get(row.id) ?? 0,
      }; }),
    });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Chargement des candidatures impossible." }, { status: 500 });
  }
}

async function postDelegatedDecision(req: Request, admin: ReturnType<typeof getAdminSupabase>, organisationId: string, assistance: AgentAssistanceContext) {
  const body = await req.json().catch(() => ({}));
  const requestId = typeof body.request_id === "string" ? body.request_id.trim() : "";
  if (!requestId) return NextResponse.json({ error: "Candidature manquante." }, { status: 400 });
  const action = body.action === "accept_historical" ? "accept_historical"
    : body.action === "materialize" ? "materialize"
      : body.action === "send_learner_access" || body.action === "send_enterprise_access" ? "retry_access"
        : body.action ? null : body.decision === "accepted" || body.decision === "refused" ? body.decision : null;
  if (!action) return NextResponse.json({ error: "Action déléguée invalide." }, { status: 400 });
  const decision = action === "refused" ? "refused" : "accepted";
  if (body.confirm_delegated !== true) return NextResponse.json({ error: "Confirmez explicitement cette action pour le compte de l’organisme." }, { status: 400 });
  let actor;
  try { actor = assertDelegatedRegistrationDecision(assistance, organisationId, decision, true); }
  catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Délégation invalide." }, { status: 403 }); }
  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1800) : "";
  if (action === "accept_historical" && (body.confirm_historical !== true || reason.length < 12)) return NextResponse.json({ error: "Confirmation et motif de régularisation historique requis (12 caractères minimum)." }, { status: 400 });
  if (["accepted", "materialize", "accept_historical"].includes(action) && !sessionId) return NextResponse.json({ error: "Choisissez la session avant de créer l’inscription." }, { status: 400 });
  const { data, error } = await admin.rpc("daily_decide_delegated_registration_request", {
    p_request_id: requestId, p_assistance_id: actor.assistanceId, p_token_hash: delegatedRegistrationTokenHash(req),
    p_action: action, p_session_id: sessionId || null,
    p_comment: typeof body.comment === "string" ? body.comment.slice(0, 2000) : null,
    p_confirmed: true, p_historical_reason: action === "accept_historical" ? reason : null,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "22023" ? 400 : error.code === "PGRST202" ? 503 : 409;
    const message = error.message.includes("prerequisites") ? "Les prérequis doivent être vérifiés avant la décision."
      : error.message.includes("analysis required") ? "L’analyse Selen doit être terminée avant la décision."
        : error.message.includes("already decided") ? "Cette candidature a déjà reçu une décision finale."
          : status === 403 ? "Délégation expirée, invalide ou hors périmètre."
            : status === 503 ? "Le parcours de décision déléguée n’est pas encore disponible." : error.message;
    return NextResponse.json({ error: message }, { status });
  }
  if (decision === "refused") return NextResponse.json({ ok: true, result: data, materialized: false, delegated: true });
  // Provision only after the SQL transaction (including its durable audit) succeeds.
  const access: RegistrationAccess = { ok: true, admin, organisationId, user: { id: actor.agentUserId } };
  const { learnerAccess, enterpriseAccess } = await provisionAcceptedAccesses(access, requestId, data?.session_id || sessionId || null, req);
  return NextResponse.json({ ok: true, result: data, materialized: true, materialization: data?.materialization,
    reconciled: data?.reconciled === true, replayed: data?.replayed === true, delegated: true,
    learner_access: learnerAccess, enterprise_access: enterpriseAccess });
}

export async function POST(req: Request) {
  try {
    const readContext = await getDailyOrganisationReadContext(req, ["sessions", "trainings"]);
    if (!readContext.ok) return NextResponse.json({ error: readContext.error }, { status: readContext.status });
    if (registrationAssistanceToken(req) && !readContext.assisted) return NextResponse.json({ error: "Délégation Studio invalide ou expirée." }, { status: 403 });
    if (readContext.assisted) {
      if (!readContext.assistance) return NextResponse.json({ error: "Délégation Studio manquante." }, { status: 403 });
      return await postDelegatedDecision(req, readContext.admin, readContext.organisationId, readContext.assistance);
    }
    const access = await getAccess();
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const body = await req.json().catch(() => ({}));
    const requestId = typeof body.request_id === "string" ? body.request_id.trim() : "";
    if (!requestId) return NextResponse.json({ error: "Candidature manquante." }, { status: 400 });

    if (body.action === "accept_historical") {
      if (!access.isManager) return NextResponse.json({ error: "Seul le responsable de l’organisme peut régulariser une session historique." }, { status: 403 });
      const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1800) : "";
      if (!sessionId || reason.length < 12 || body.confirm_historical !== true) return NextResponse.json({ error: "Session, confirmation et motif de régularisation requis (12 caractères minimum)." }, { status: 400 });
      const { data: requestScope, error: requestError } = await access.admin.from("daily_formation_registration_requests").select("formation_id").eq("id", requestId).maybeSingle();
      if (requestError || !requestScope) return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
      const { data: formationScope } = await access.admin.from("daily_formations").select("id").eq("id", requestScope.formation_id).eq("organisation_id", access.organisationId).maybeSingle();
      const { data: sessionScope } = await access.admin.from("daily_sessions").select("id").eq("id", sessionId).eq("organisation_id", access.organisationId).maybeSingle();
      if (!formationScope || !sessionScope) return NextResponse.json({ error: "Régularisation hors de votre organisme." }, { status: 403 });
      const { error: reconciliationError } = await access.admin.rpc("daily_accept_historical_registration_request", {
        p_request_id: requestId, p_session_id: sessionId, p_actor_user_id: access.user.id, p_reason: reason,
      });
      if (reconciliationError) return NextResponse.json({ error: reconciliationError.message }, { status: 409 });
      const { learnerAccess, enterpriseAccess } = await provisionAcceptedAccesses(access, requestId, sessionId, req);
      return NextResponse.json({ ok: true, reconciled: true, learner_access: learnerAccess, enterprise_access: enterpriseAccess });
    }

    if (body.action === "materialize") {
      if (!access.isManager) return NextResponse.json({ error: "Seul le responsable de l'organisme peut choisir la session." }, { status: 403 });
      const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
      if (!sessionId) return NextResponse.json({ error: "Choisissez une session." }, { status: 400 });
      const { data: requestRow, error: requestError } = await access.admin.from("daily_formation_registration_requests").select("id,formation_id,decision_status").eq("id", requestId).single();
      if (requestError || !requestRow) return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
      const { data: formation, error: formationError } = await access.admin.from("daily_formations").select("organisation_id").eq("id", requestRow.formation_id).single();
      if (formationError || formation?.organisation_id !== access.organisationId) return NextResponse.json({ error: "Candidature hors de votre organisme." }, { status: 403 });
      if (requestRow.decision_status !== "accepted") return NextResponse.json({ error: "La candidature doit d'abord être acceptée." }, { status: 409 });
      const { data: sessionScope, error: scopeError } = await access.admin.from("daily_sessions").select("id,organisation_id,formation_id").eq("id", sessionId).eq("organisation_id", access.organisationId).eq("formation_id", requestRow.formation_id).not("status", "in", "(archived,cancelled)").maybeSingle();
      if (scopeError || !sessionScope) return NextResponse.json({ error: "Session hors du périmètre de cette candidature." }, { status: 403 });
      const { data, error } = await access.admin.rpc("daily_materialize_registration_request", { p_request_id: requestId, p_session_id: sessionId });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      const { learnerAccess, enterpriseAccess } = await provisionAcceptedAccesses(access, requestId, sessionId, req);
      return NextResponse.json({ ok: true, materialized: true, result: data, learner_access: learnerAccess, enterprise_access: enterpriseAccess });
    }

    if (body.action === "send_learner_access") {
      if (!access.isManager) return NextResponse.json({ error: "Seul le responsable de l'organisme peut relancer les accès apprenants." }, { status: 403 });
      const learnerAccess = await provisionLearnerAccess(access, requestId, req);
      return NextResponse.json({ ok: true, learner_access: learnerAccess });
    }

    if (body.action === "send_enterprise_access") {
      if (!access.isManager) return NextResponse.json({ error: "Seul le responsable de l'organisme peut relancer les accès entreprise." }, { status: 403 });
      const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : null;
      const enterpriseAccess = await provisionEnterpriseAccess(access, requestId, sessionId, req);
      return NextResponse.json({ ok: true, enterprise_access: enterpriseAccess });
    }

    const decision: Decision | null = body.decision === "accepted" || body.decision === "refused" ? body.decision : null;
    const requestedActorType: ActorType | null = body.actor_type === "organisation" ? "organisation" : null;
    const comment = typeof body.comment === "string" ? body.comment.slice(0, 2000) : null;
    if (!decision || !requestedActorType) return NextResponse.json({ error: "Décision incomplète." }, { status: 400 });
    if (requestedActorType === "organisation" && !access.isManager) return NextResponse.json({ error: "Seul un responsable de l'organisme peut répondre au nom de l'OF." }, { status: 403 });
    if (!access.isManager) return NextResponse.json({ error: "Seul le responsable de l’organisme peut prendre la décision finale." }, { status: 403 });

    const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
    if (decision === "accepted" && !sessionId) return NextResponse.json({ error: "Choisissez la session avant d’accepter la candidature." }, { status: 400 });
    // The atomic RPC can replay an accepted request. Scope must be checked
    // before both initial decisions and retries, including notification work.
    const { data: requestScope, error: requestScopeError } = await access.admin.from("daily_formation_registration_requests").select("id,formation_id").eq("id", requestId).maybeSingle();
    if (requestScopeError) throw new Error(requestScopeError.message);
    if (!requestScope) return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
    const { data: formationScope, error: formationScopeError } = await access.admin.from("daily_formations").select("id").eq("id", requestScope.formation_id).eq("organisation_id", access.organisationId).maybeSingle();
    if (formationScopeError) throw new Error(formationScopeError.message);
    if (!formationScope) return NextResponse.json({ error: "Candidature hors de votre organisme." }, { status: 403 });
    if (decision === "accepted") {
      const { data: sessionScope, error: sessionScopeError } = await access.admin.from("daily_sessions").select("id").eq("id", sessionId).eq("organisation_id", access.organisationId).eq("formation_id", requestScope.formation_id).not("status", "in", "(archived,cancelled)").maybeSingle();
      if (sessionScopeError) throw new Error(sessionScopeError.message);
      if (!sessionScope) return NextResponse.json({ error: "Session hors du périmètre de cette candidature." }, { status: 403 });
    }
    const rpcName = decision === "accepted" ? "daily_accept_and_materialize_registration_request" : "daily_record_registration_request_decision";
    const rpcArgs = decision === "accepted" ? {
      p_request_id: requestId,
      p_session_id: sessionId,
      p_actor_user_id: access.user.id,
      p_comment: comment,
    } : {
      p_request_id: requestId,
      p_actor_user_id: access.user.id,
      p_actor_type: requestedActorType,
      p_decision: decision,
      p_comment: comment,
    };
    const { data, error } = await access.admin.rpc(rpcName, rpcArgs);
    if (error) {
      const known = error.message.includes("already decided") ? "Cette candidature a déjà reçu une décision finale." : error.message.includes("analysis required") ? "L’analyse Selen doit être terminée avant la décision OF." : error.message.includes("permission required") ? "Vous n’êtes pas autorisé à statuer sur cette candidature." : error.message;
      return NextResponse.json({ error: known }, { status: 409 });
    }

    if (decision === "accepted") {
      const { learnerAccess, enterpriseAccess } = await provisionAcceptedAccesses(access, requestId, sessionId, req);
      return NextResponse.json({ ok: true, result: data, materialized: true, materialization: data?.materialization, replayed: data?.replayed === true, learner_access: learnerAccess, enterprise_access: enterpriseAccess });
    }
    return NextResponse.json({ ok: true, result: data, materialized: false });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Décision impossible." }, { status: 500 });
  }
}
