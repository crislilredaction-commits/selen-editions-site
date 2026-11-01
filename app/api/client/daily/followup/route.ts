import { NextResponse } from "next/server";
import { blockedAgentAssistanceResponse, getAssistanceTokenFromRequest } from "@/lib/server/agentAssistance";
import { getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

const ENTRY_TYPES = new Set(["incident", "adaptation", "absence"]);
const LEVELS = new Set(["info", "attention", "critical"]);
const TECHNICAL_ERROR = "Une erreur technique empêche le suivi de cette session. Réessayez.";
const INACTIVE_ENROLMENTS = new Set(["cancelled", "declined", "abandoned", "completed"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(body: Record<string, unknown>, key: string) {
  return String(body[key] ?? "").trim();
}

function organisationAuthorName(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }) {
  const metadata = user.user_metadata ?? {};
  const displayName = String(metadata.full_name ?? metadata.name ?? metadata.display_name ?? "").trim();
  return displayName || user.email?.trim() || "Organisme de formation";
}

async function refreshFollowupChecklist(
  admin: ReturnType<typeof import("@/lib/server/clientNdaAccess").getAdminSupabase>,
  organisationId: string,
  sessionId: string,
): Promise<boolean> {
  try {
    const [
      { data: slots, error: slotsError },
      { data: records, error: recordsError },
      { count: openEntries, error: entriesError },
    ] = await Promise.all([
      admin.from("daily_attendance_slots").select("status").eq("organisation_id", organisationId).eq("session_id", sessionId),
      admin.from("daily_attendance_records").select("status").eq("organisation_id", organisationId).eq("session_id", sessionId),
      admin.from("daily_session_followup_entries").select("id", { count: "exact", head: true }).eq("organisation_id", organisationId).eq("session_id", sessionId).eq("status", "open"),
    ]);

    // Ne jamais recalculer une obligation à partir de données partielles ou d'un comptage inconnu.
    if (slotsError || recordsError || entriesError || openEntries == null || !slots || !records) return false;

    const allSlotsClosed = slots.length > 0 && slots.every((slot) => ["closed", "cancelled"].includes(slot.status));
    const allRecordsDecided = records.length > 0 && records.every((record) => record.status !== "pending");
    const hasAttendanceActivity = slots.some((slot) => slot.status !== "draft") || records.some((record) => record.status !== "pending");

    let status = "todo";
    if (openEntries > 0 || hasAttendanceActivity) status = "in_progress";
    if (openEntries === 0 && allSlotsClosed && allRecordsDecided) status = "to_review";

    const { error: checklistError } = await admin
      .from("daily_session_checklist_items")
      .update({ status })
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId)
      .eq("item_key", "attendance_followup")
      .neq("status", "not_applicable");
    return !checklistError;
  } catch {
    // Le suivi métier est déjà enregistré : signaler une synchronisation incomplète, sans faux échec.
    return false;
  }
}

async function sessionExists(
  admin: ReturnType<typeof import("@/lib/server/clientNdaAccess").getAdminSupabase>,
  organisationId: string,
  sessionId: string,
) {
  const { data, error } = await admin
    .from("daily_sessions")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error("session_lookup_failed");
  return Boolean(data);
}

export async function GET(request: Request) {
  const context = await getDailyOrganisationReadContext(request, ["sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.assisted && !context.capabilities?.sessions) return NextResponse.json({ sessions: [] });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id")?.trim();
  if (!sessionId) {
    const { data, error } = await context.admin
      .from("daily_sessions")
      .select("id,internal_reference,start_date,end_date,status,daily_formations(id,title)")
      .eq("organisation_id", context.organisationId)
      .neq("status", "archived")
      .order("start_date", { ascending: false });
    if (error) return NextResponse.json({ error: TECHNICAL_ERROR }, { status: 500 });
    return NextResponse.json({ sessions: data ?? [] });
  }

  let sessionFound: boolean;
  try {
    sessionFound = await sessionExists(context.admin, context.organisationId, sessionId);
  } catch {
    return NextResponse.json({ error: "Impossible de vérifier la session pour le moment." }, { status: 503 });
  }
  if (!sessionFound) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  const [{ data: entries, error: entriesError }, { data: enrolments, error: enrolmentsError }] = await Promise.all([
    context.admin
      .from("daily_session_followup_entries")
      .select("id,session_id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,author_role,author_name,created_at,updated_at")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .order("occurred_at", { ascending: false }),
    context.admin
      .from("daily_session_enrolments")
      .select("id,status,daily_learners(id,first_name,last_name,email)")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .not("status", "in", "(cancelled,declined,abandoned,completed)"),
  ]);
  if (entriesError || enrolmentsError) return NextResponse.json({ error: TECHNICAL_ERROR }, { status: 500 });
  return NextResponse.json({ entries: entries ?? [], enrolments: enrolments ?? [] });
}

export async function POST(request: Request) {
  if (getAssistanceTokenFromRequest(request)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationContext(request, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body, "action") || "create";
  const sessionId = text(body, "session_id");
  if (!sessionId) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
  let sessionFound: boolean;
  try {
    sessionFound = await sessionExists(context.admin, context.organisationId, sessionId);
  } catch {
    return NextResponse.json({ error: "Impossible de vérifier la session pour le moment." }, { status: 503 });
  }
  if (!sessionFound) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  if (action === "create") {
    const entryType = text(body, "entry_type");
    const requestId = text(body, "request_id");
    const level = text(body, "level") || "attention";
    const summary = text(body, "summary");
    const description = text(body, "description") || null;
    const actionTaken = text(body, "action_taken") || null;
    const enrolmentId = text(body, "enrolment_id") || null;
    const occurredAtRaw = text(body, "occurred_at");
    const occurredAt = occurredAtRaw && !Number.isNaN(Date.parse(occurredAtRaw)) ? new Date(occurredAtRaw).toISOString() : new Date().toISOString();

    if (!ENTRY_TYPES.has(entryType)) return NextResponse.json({ error: "Type de suivi invalide." }, { status: 400 });
    if (!UUID_PATTERN.test(requestId)) return NextResponse.json({ error: "Identifiant de requête invalide." }, { status: 400 });
    if (!LEVELS.has(level)) return NextResponse.json({ error: "Niveau de suivi invalide." }, { status: 400 });
    if (!summary || summary.length > 240) return NextResponse.json({ error: "Le résumé est obligatoire et limité à 240 caractères." }, { status: 400 });

    if (enrolmentId) {
      const { data: enrolment, error: enrolmentError } = await context.admin
        .from("daily_session_enrolments")
        .select("id,status")
        .eq("organisation_id", context.organisationId)
        .eq("session_id", sessionId)
        .eq("id", enrolmentId)
        .maybeSingle();
      if (enrolmentError) return NextResponse.json({ error: "Impossible de vérifier l'inscription pour le moment." }, { status: 503 });
      if (!enrolment || INACTIVE_ENROLMENTS.has(enrolment.status)) {
        return NextResponse.json({ error: "Inscription introuvable ou inactive." }, { status: 404 });
      }
    }

    const { data, error } = await context.admin
      .from("daily_session_followup_entries")
      .insert({
        id: requestId,
        organisation_id: context.organisationId,
        session_id: sessionId,
        enrolment_id: enrolmentId,
        entry_type: entryType,
        level,
        occurred_at: occurredAt,
        summary,
        description,
        action_taken: actionTaken,
        status: "open",
        created_by: context.user.id,
        author_role: "Organisme de formation",
        author_name: organisationAuthorName(context.user),
      })
      .select("*")
      .single();
    if (error?.code === "23505") {
      // Un nouvel essai après une réponse perdue doit aussi réparer la checklist
      // si le premier enregistrement a réussi mais pas sa synchronisation.
      const { data: replay, error: replayError } = await context.admin
        .from("daily_session_followup_entries")
        .select("*")
        .eq("id", requestId)
        .eq("organisation_id", context.organisationId)
        .eq("session_id", sessionId)
        .maybeSingle();
      if (replayError) return NextResponse.json({ error: TECHNICAL_ERROR }, { status: 503 });
      if (replay) {
        const checklistSynced = await refreshFollowupChecklist(context.admin, context.organisationId, sessionId);
        return NextResponse.json({
          ok: true, entry: replay, replayed: true, checklist_synced: checklistSynced,
          ...(checklistSynced ? {} : { warning: "Le suivi est enregistré, mais l’état des tâches n’a pas pu être actualisé. Vérifiez le tableau de bord plus tard." }),
        });
      }
    }
    if (error) return NextResponse.json({ error: TECHNICAL_ERROR }, { status: 500 });
    const checklistSynced = await refreshFollowupChecklist(context.admin, context.organisationId, sessionId);
    return NextResponse.json({ ok: true, entry: data, checklist_synced: checklistSynced, ...(checklistSynced ? {} : { warning: "Le suivi est enregistré, mais l’état des tâches n’a pas pu être actualisé. Vérifiez le tableau de bord plus tard." }) });
  }

  if (action === "resolve") {
    const id = text(body, "id");
    if (!id) return NextResponse.json({ error: "Élément de suivi requis." }, { status: 400 });
    const actionTaken = text(body, "action_taken");
    if (!actionTaken) return NextResponse.json({ error: "L’action réalisée est requise pour clôturer le suivi." }, { status: 400 });
    const now = new Date().toISOString();
    const { data, error } = await context.admin
      .from("daily_session_followup_entries")
      .update({ status: "resolved", action_taken: actionTaken, resolved_by: context.user.id, resolved_at: now, updated_at: now })
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("id", id)
      .eq("status", "open")
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: TECHNICAL_ERROR }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Élément déjà traité ou introuvable." }, { status: 404 });
    const checklistSynced = await refreshFollowupChecklist(context.admin, context.organisationId, sessionId);
    return NextResponse.json({ ok: true, entry: data, checklist_synced: checklistSynced, ...(checklistSynced ? {} : { warning: "Le suivi est enregistré, mais l’état des tâches n’a pas pu être actualisé. Vérifiez le tableau de bord plus tard." }) });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
