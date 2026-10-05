import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";
import { sendLearnerPortalAccessForRegistrationRequest } from "@/lib/server/dailyLearnerPortalAccess";
import { sendEnterprisePortalAccessForRegistrationRequest } from "@/lib/server/dailyEnterprisePortalAccess";

type DecisionStatus = "pending" | "ready_for_of" | "accepted" | "refused";
type ActorType = "organisation";
type Decision = "accepted" | "refused";

type FormationRow = { id: string; organisation_id: string; title: string; allowed_trainer_ids?: unknown };
type SessionRow = { id: string; formation_id: string; internal_reference?: string | null; start_date?: string | null; end_date?: string | null; status?: string | null };
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

async function provisionLearnerAccess(access: Awaited<ReturnType<typeof getAccess>>, requestId: string, req: Request) {
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

async function provisionEnterpriseAccess(access: Awaited<ReturnType<typeof getAccess>>, requestId: string, sessionId: string | null, req: Request) {
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

async function provisionAcceptedAccesses(access: Awaited<ReturnType<typeof getAccess>>, requestId: string, sessionId: string | null, req: Request) {
  const [learnerAccess, enterpriseAccess] = await Promise.all([
    provisionLearnerAccess(access, requestId, req),
    provisionEnterpriseAccess(access, requestId, sessionId, req),
  ]);
  return { learnerAccess, enterpriseAccess };
}

export async function GET() {
  try {
    const access = await getAccess();
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    if (!access.isManager) return NextResponse.json({ error: "Accès réservé au responsable de l’organisme." }, { status: 403 });

    const { data: formations, error: formationError } = await access.admin
      .from("daily_formations")
      .select("id,organisation_id,title,allowed_trainer_ids")
      .eq("organisation_id", access.organisationId)
      .neq("status", "archived");
    if (formationError) throw new Error(formationError.message);
    const visibleFormations = ((formations ?? []) as FormationRow[]);
    const formationIds = visibleFormations.map((formation) => formation.id);
    if (!formationIds.length) return NextResponse.json({ requests: [], sessions: [], actor_types: access.isManager ? ["organisation"] : ["trainer"] });

    const [{ data: requests, error: requestError }, { data: sessions, error: sessionError }] = await Promise.all([
      access.admin.from("daily_formation_registration_requests")
        .select("id,formation_id,response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,participants,adaptation_needed,submitted_at,attached_session_id,materialized_at,status,decision_status,accepted_at,agent_review_requested_at,agent_analysis_completed_at,agent_analysis_summary,positioning_answers")
        .in("formation_id", formationIds).neq("status", "archived").order("submitted_at", { ascending: false }),
      access.isManager
        ? access.admin.from("daily_sessions").select("id,formation_id,internal_reference,start_date,end_date,status").eq("organisation_id", access.organisationId).in("formation_id", formationIds).neq("status", "archived").order("start_date", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (requestError || sessionError) throw new Error(requestError?.message ?? sessionError?.message ?? "Chargement impossible.");

    const requestRows = (requests ?? []) as RequestRow[];
    const requestIds = requestRows.map((row) => row.id);
    const [{ data: decisions, error: decisionError }, { data: materializations, error: materializationError }] = requestIds.length
      ? await Promise.all([
          access.admin.from("daily_registration_request_decisions").select("id,registration_request_id,actor_type,decision,comment,decided_at,trainer_profile_id").in("registration_request_id", requestIds).order("decided_at", { ascending: false }),
          access.admin.from("daily_registration_request_enrolments").select("registration_request_id,enrolment_id").in("registration_request_id", requestIds),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (decisionError || materializationError) throw new Error(decisionError?.message ?? materializationError?.message ?? "Chargement impossible.");

    const formationById = new Map(visibleFormations.map((formation) => [formation.id, formation]));
    const decisionsByRequest = new Map<string, typeof decisions>();
    for (const decision of decisions ?? []) {
      const current = decisionsByRequest.get(decision.registration_request_id) ?? [];
      current.push(decision);
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
    if (access.isManager) actorTypes.push("organisation");
    return NextResponse.json({
      actor_types: actorTypes,
      sessions: (sessions ?? []) as SessionRow[],
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
        can_materialize: access.isManager && row.decision_status === "accepted" && !row.materialized_at,
        materialized_count: materializedCount.get(row.id) ?? 0,
      }; }),
    });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Chargement des candidatures impossible." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const access = await getAccess();
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const body = await req.json().catch(() => ({}));
    const requestId = typeof body.request_id === "string" ? body.request_id.trim() : "";
    if (!requestId) return NextResponse.json({ error: "Candidature manquante." }, { status: 400 });

    if (body.action === "materialize") {
      if (!access.isManager) return NextResponse.json({ error: "Seul le responsable de l'organisme peut choisir la session." }, { status: 403 });
      const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
      if (!sessionId) return NextResponse.json({ error: "Choisissez une session." }, { status: 400 });
      const { data: requestRow, error: requestError } = await access.admin.from("daily_formation_registration_requests").select("id,formation_id,decision_status").eq("id", requestId).single();
      if (requestError || !requestRow) return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
      const { data: formation, error: formationError } = await access.admin.from("daily_formations").select("organisation_id").eq("id", requestRow.formation_id).single();
      if (formationError || formation?.organisation_id !== access.organisationId) return NextResponse.json({ error: "Candidature hors de votre organisme." }, { status: 403 });
      if (requestRow.decision_status !== "accepted") return NextResponse.json({ error: "La candidature doit d'abord être acceptée." }, { status: 409 });
      const { data: sessionScope, error: scopeError } = await access.admin.from("daily_sessions").select("id,organisation_id,formation_id").eq("id", sessionId).eq("organisation_id", access.organisationId).eq("formation_id", requestRow.formation_id).maybeSingle();
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
