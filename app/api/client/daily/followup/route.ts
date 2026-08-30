import { NextResponse } from "next/server";
import { blockedAgentAssistanceResponse, getAssistanceTokenFromRequest } from "@/lib/server/agentAssistance";
import { getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

const ENTRY_TYPES = new Set(["incident", "adaptation"]);
const LEVELS = new Set(["info", "attention", "critical"]);

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
) {
  const [{ data: slots }, { data: records }, { count: openEntries }] = await Promise.all([
    admin.from("daily_attendance_slots").select("status").eq("organisation_id", organisationId).eq("session_id", sessionId),
    admin.from("daily_attendance_records").select("status").eq("organisation_id", organisationId).eq("session_id", sessionId),
    admin.from("daily_session_followup_entries").select("id", { count: "exact", head: true }).eq("organisation_id", organisationId).eq("session_id", sessionId).eq("status", "open"),
  ]);

  const allSlotsClosed = (slots ?? []).length > 0 && (slots ?? []).every((slot) => ["closed", "cancelled"].includes(slot.status));
  const allRecordsDecided = (records ?? []).length > 0 && (records ?? []).every((record) => record.status !== "pending");
  const hasAttendanceActivity = (slots ?? []).some((slot) => slot.status !== "draft") || (records ?? []).some((record) => record.status !== "pending");

  let status = "todo";
  if ((openEntries ?? 0) > 0 || hasAttendanceActivity) status = "in_progress";
  if ((openEntries ?? 0) === 0 && allSlotsClosed && allRecordsDecided) status = "to_review";

  await admin
    .from("daily_session_checklist_items")
    .update({ status })
    .eq("organisation_id", organisationId)
    .eq("session_id", sessionId)
    .eq("item_key", "attendance_followup")
    .neq("status", "not_applicable");
}

async function sessionExists(
  admin: ReturnType<typeof import("@/lib/server/clientNdaAccess").getAdminSupabase>,
  organisationId: string,
  sessionId: string,
) {
  const { data } = await admin
    .from("daily_sessions")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("id", sessionId)
    .maybeSingle();
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sessions: data ?? [] });
  }

  if (!(await sessionExists(context.admin, context.organisationId, sessionId))) {
    return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
  }

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
      .not("status", "in", "(cancelled,declined)"),
  ]);
  if (entriesError || enrolmentsError) return NextResponse.json({ error: entriesError?.message ?? enrolmentsError?.message }, { status: 500 });
  return NextResponse.json({ entries: entries ?? [], enrolments: enrolments ?? [] });
}

export async function POST(request: Request) {
  if (getAssistanceTokenFromRequest(request)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationContext(request, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body, "action") || "create";
  const sessionId = text(body, "session_id");
  if (!sessionId || !(await sessionExists(context.admin, context.organisationId, sessionId))) {
    return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
  }

  if (action === "create") {
    const entryType = text(body, "entry_type");
    const level = text(body, "level") || "attention";
    const summary = text(body, "summary");
    const description = text(body, "description") || null;
    const actionTaken = text(body, "action_taken") || null;
    const enrolmentId = text(body, "enrolment_id") || null;
    const occurredAtRaw = text(body, "occurred_at");
    const occurredAt = occurredAtRaw && !Number.isNaN(Date.parse(occurredAtRaw)) ? new Date(occurredAtRaw).toISOString() : new Date().toISOString();

    if (!ENTRY_TYPES.has(entryType)) return NextResponse.json({ error: "Type de suivi invalide." }, { status: 400 });
    if (!LEVELS.has(level)) return NextResponse.json({ error: "Niveau de suivi invalide." }, { status: 400 });
    if (!summary || summary.length > 240) return NextResponse.json({ error: "Le résumé est obligatoire et limité à 240 caractères." }, { status: 400 });

    if (enrolmentId) {
      const { data: enrolment } = await context.admin
        .from("daily_session_enrolments")
        .select("id,status")
        .eq("organisation_id", context.organisationId)
        .eq("session_id", sessionId)
        .eq("id", enrolmentId)
        .maybeSingle();
      if (!enrolment || ["cancelled", "declined"].includes(enrolment.status)) {
        return NextResponse.json({ error: "Inscription introuvable ou inactive." }, { status: 404 });
      }
    }

    const { data, error } = await context.admin
      .from("daily_session_followup_entries")
      .insert({
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await refreshFollowupChecklist(context.admin, context.organisationId, sessionId);
    return NextResponse.json({ ok: true, entry: data });
  }

  if (action === "resolve") {
    const id = text(body, "id");
    if (!id) return NextResponse.json({ error: "Élément de suivi requis." }, { status: 400 });
    const actionTaken = text(body, "action_taken") || null;
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Élément déjà traité ou introuvable." }, { status: 404 });
    await refreshFollowupChecklist(context.admin, context.organisationId, sessionId);
    return NextResponse.json({ ok: true, entry: data });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
