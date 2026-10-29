import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };
const ENTRY_TYPES = new Set(["incident", "adaptation", "absence", "delay", "abandonment_alert"]);
const ATTENDANCE_ENTRY_TYPES = new Set(["absence", "delay", "abandonment_alert"]);
const LEVELS = new Set(["info", "attention", "critical"]);
const INACTIVE_ENROLMENTS = new Set(["declined", "cancelled", "abandoned", "completed"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown) => String(value ?? "").trim();

async function trainerAccess(token: string) {
  const admin = getAdminSupabase();
  const { data: access, error } = await admin.from("daily_portal_access_tokens").select("id,portal_type,session_id,status,expires_at,entity_name,entity_email").eq("token", token).maybeSingle();
  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!access || access.portal_type !== "trainer") return { ok: false as const, status: 403, error: "Accès formateur requis." };
  if (access.expires_at && new Date(access.expires_at).getTime() < Date.now()) return { ok: false as const, status: 410, error: "Ce lien a expiré." };
  if (["revoked", "expired"].includes(String(access.status ?? ""))) return { ok: false as const, status: 403, error: "Cet accès n’est plus actif." };
  const { data: session, error: sessionError } = await admin.from("daily_sessions").select("id,organisation_id").eq("id", access.session_id).neq("status", "archived").maybeSingle();
  if (sessionError) return { ok: false as const, status: 500, error: sessionError.message };
  if (!session) return { ok: false as const, status: 404, error: "Session introuvable." };
  return { ok: true as const, admin, access, session };
}

async function refreshFollowupChecklist(admin: ReturnType<typeof getAdminSupabase>, organisationId: string, sessionId: string) {
  const [{ data: slots }, { data: records }, { count: openEntries }] = await Promise.all([
    admin.from("daily_attendance_slots").select("status").eq("organisation_id", organisationId).eq("session_id", sessionId),
    admin.from("daily_attendance_records").select("status").eq("organisation_id", organisationId).eq("session_id", sessionId),
    admin.from("daily_session_followup_entries").select("id", { count: "exact", head: true }).eq("organisation_id", organisationId).eq("session_id", sessionId).eq("status", "open"),
  ]);
  const allSlotsClosed = (slots ?? []).length > 0 && (slots ?? []).every((slot) => ["closed", "cancelled"].includes(slot.status));
  const allRecordsDecided = (records ?? []).length > 0 && (records ?? []).every((record) => record.status !== "pending");
  const hasAttendanceActivity = (slots ?? []).some((slot) => slot.status !== "draft") || (records ?? []).some((record) => record.status !== "pending");
  const status = (openEntries ?? 0) === 0 && allSlotsClosed && allRecordsDecided ? "to_review" : ((openEntries ?? 0) > 0 || hasAttendanceActivity ? "in_progress" : "todo");
  await admin.from("daily_session_checklist_items").update({ status }).eq("organisation_id", organisationId).eq("session_id", sessionId).eq("item_key", "attendance_followup").neq("status", "not_applicable");
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params; const auth = await trainerAccess(text(token));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.admin.from("daily_session_followup_entries").select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,author_role,author_name").eq("session_id", auth.access.session_id).order("occurred_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params; const auth = await trainerAccess(text(token));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const entryType = text(body.entry_type), level = text(body.level), summary = text(body.summary), enrolmentId = text(body.enrolment_id), requestId = text(body.request_id);
  if (!ENTRY_TYPES.has(entryType) || !LEVELS.has(level) || !summary) return NextResponse.json({ error: "Type, niveau et constat sont requis." }, { status: 400 });
  if (!UUID_PATTERN.test(requestId)) return NextResponse.json({ error: "Identifiant de requête invalide." }, { status: 400 });
  if (ATTENDANCE_ENTRY_TYPES.has(entryType)) {
    if (!enrolmentId) return NextResponse.json({ error: "Apprenant requis pour ce signalement." }, { status: 400 });
  }
  if (enrolmentId) {
    const { data: enrolment, error: enrolmentError } = await auth.admin.from("daily_session_enrolments").select("id,status").eq("id", enrolmentId).eq("session_id", auth.access.session_id).eq("organisation_id", auth.session.organisation_id).maybeSingle();
    if (enrolmentError) return NextResponse.json({ error: enrolmentError.message }, { status: 500 });
    if (!enrolment || INACTIVE_ENROLMENTS.has(text(enrolment.status))) return NextResponse.json({ error: "Inscription introuvable ou inactive." }, { status: 404 });
  }
  const authorName = text(auth.access.entity_name) || text(auth.access.entity_email) || "Formateur";
  const { data, error } = await auth.admin.from("daily_session_followup_entries").insert({ id: requestId, organisation_id: auth.session.organisation_id, session_id: auth.access.session_id, enrolment_id: enrolmentId || null, entry_type: entryType, level, summary, description: text(body.description) || null, action_taken: text(body.action_taken) || null, status: "open", author_role: "Formateur", author_name: authorName }).select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,author_role,author_name").single();
  if (error?.code === "23505") {
    const { data: replay } = await auth.admin.from("daily_session_followup_entries").select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,author_role,author_name").eq("id", requestId).eq("organisation_id", auth.session.organisation_id).eq("session_id", auth.access.session_id).maybeSingle();
    if (replay) return NextResponse.json({ entry: replay, replayed: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await refreshFollowupChecklist(auth.admin, auth.session.organisation_id, auth.access.session_id);
  return NextResponse.json({ entry: data }, { status: 201 });
}

export async function PATCH(request: Request, { params }: Params) {
  const { token } = await params; const auth = await trainerAccess(text(token));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>; const id = text(body.id), actionTaken = text(body.action_taken);
  if (!id || !actionTaken) return NextResponse.json({ error: "Suivi et action réalisée sont requis." }, { status: 400 });
  const { data, error } = await auth.admin.from("daily_session_followup_entries").update({ action_taken: actionTaken, status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id).eq("organisation_id", auth.session.organisation_id).eq("session_id", auth.access.session_id).eq("status", "open").select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,author_role,author_name").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Suivi déjà traité ou introuvable." }, { status: 404 });
  await refreshFollowupChecklist(auth.admin, auth.session.organisation_id, auth.access.session_id);
  return NextResponse.json({ entry: data });
}
