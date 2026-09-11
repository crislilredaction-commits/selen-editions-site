import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";

type DecisionStatus = "pending" | "agent_review" | "accepted";
type ActorType = "organisation" | "trainer";
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
};

function jsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function applicantLabel(row: RequestRow) {
  const person = [row.respondent_first_name, row.respondent_last_name].filter(Boolean).join(" ").trim();
  return row.company_name?.trim() || person || row.respondent_email?.trim() || "Candidat";
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

export async function GET() {
  try {
    const access = await getAccess();
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    if (!access.isManager && !access.trainerProfileId) return NextResponse.json({ error: "Accès réservé au responsable de l'organisme ou à un formateur." }, { status: 403 });

    const { data: formations, error: formationError } = await access.admin
      .from("daily_formations")
      .select("id,organisation_id,title,allowed_trainer_ids")
      .eq("organisation_id", access.organisationId)
      .neq("status", "archived");
    if (formationError) throw new Error(formationError.message);
    const visibleFormations = ((formations ?? []) as FormationRow[]).filter((formation) => access.isManager || Boolean(access.trainerProfileId && jsonArray(formation.allowed_trainer_ids).includes(access.trainerProfileId)));
    const formationIds = visibleFormations.map((formation) => formation.id);
    if (!formationIds.length) return NextResponse.json({ requests: [], sessions: [], actor_types: access.isManager ? ["organisation"] : ["trainer"] });

    const [{ data: requests, error: requestError }, { data: sessions, error: sessionError }] = await Promise.all([
      access.admin.from("daily_formation_registration_requests")
        .select("id,formation_id,response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,participants,adaptation_needed,submitted_at,attached_session_id,materialized_at,status,decision_status,accepted_at,agent_review_requested_at")
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

    const actorTypes: ActorType[] = [];
    if (access.isManager) actorTypes.push("organisation");
    if (access.trainerProfileId) actorTypes.push("trainer");
    return NextResponse.json({
      actor_types: actorTypes,
      sessions: (sessions ?? []) as SessionRow[],
      requests: requestRows.map((row) => ({
        ...row,
        applicant_label: applicantLabel(row),
        formation_title: formationById.get(row.formation_id)?.title ?? "Formation",
        decisions: decisionsByRequest.get(row.id) ?? [],
        can_decide: row.decision_status === "pending",
        can_materialize: access.isManager && row.decision_status === "accepted" && !row.materialized_at,
        materialized_count: materializedCount.get(row.id) ?? 0,
      })),
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
      const { data, error } = await access.admin.rpc("daily_materialize_registration_request", { p_request_id: requestId, p_session_id: sessionId });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json({ ok: true, materialized: true, result: data });
    }

    const decision: Decision | null = body.decision === "accepted" || body.decision === "refused" ? body.decision : null;
    const requestedActorType: ActorType | null = body.actor_type === "organisation" || body.actor_type === "trainer" ? body.actor_type : null;
    const comment = typeof body.comment === "string" ? body.comment.slice(0, 2000) : null;
    if (!decision || !requestedActorType) return NextResponse.json({ error: "Décision incomplète." }, { status: 400 });
    if (requestedActorType === "organisation" && !access.isManager) return NextResponse.json({ error: "Seul un responsable de l'organisme peut répondre au nom de l'OF." }, { status: 403 });
    if (requestedActorType === "trainer" && !access.trainerProfileId) return NextResponse.json({ error: "Profil formateur actif requis." }, { status: 403 });

    const { data, error } = await access.admin.rpc("daily_record_registration_request_decision", {
      p_request_id: requestId,
      p_actor_user_id: access.user.id,
      p_actor_type: requestedActorType,
      p_decision: decision,
      p_comment: comment,
    });
    if (error) {
      const known = error.message.includes("already accepted") ? "Cette candidature a déjà été acceptée." : error.message.includes("awaiting agent review") ? "Cette candidature a déjà été transmise à Selen pour décision." : error.message.includes("permission required") ? "Vous n'êtes pas autorisé à statuer sur cette candidature." : error.message;
      return NextResponse.json({ error: known }, { status: 409 });
    }

    if (decision === "accepted") {
      const { data: acceptedRequest, error: acceptedRequestError } = await access.admin.from("daily_formation_registration_requests").select("attached_session_id").eq("id", requestId).single();
      if (acceptedRequestError) throw new Error(acceptedRequestError.message);
      if (acceptedRequest?.attached_session_id) {
        const { data: materialized, error: materializedError } = await access.admin.rpc("daily_materialize_registration_request", { p_request_id: requestId, p_session_id: acceptedRequest.attached_session_id });
        if (!materializedError) return NextResponse.json({ ok: true, result: data, materialized: true, materialization: materialized });
        return NextResponse.json({ ok: true, result: data, materialized: false, materialization_error: materializedError.message });
      }
    }
    return NextResponse.json({ ok: true, result: data, materialized: false });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Décision impossible." }, { status: 500 });
  }
}
