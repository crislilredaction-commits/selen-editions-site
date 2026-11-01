import { isValidPortalExpiry } from "@/lib/daily/portalAttendanceAccess.mjs";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };
const ENTRY_TYPES = new Set(["incident", "adaptation", "absence", "delay", "abandonment_alert"]);
const ATTENDANCE_ENTRY_TYPES = new Set(["absence", "delay", "abandonment_alert"]);
const LEVELS = new Set(["info", "attention", "critical"]);
const INACTIVE_ENROLMENTS = new Set(["declined", "cancelled", "abandoned", "completed"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown) => String(value ?? "").trim();
const portalResponse = (body: Record<string, unknown>, options: { status?: number } = {}) =>
  NextResponse.json(body, { ...options, headers: { "Cache-Control": "private, no-store" } });
const transientError = () => portalResponse(
  { error: "Le suivi de session est temporairement indisponible. Réessayez plus tard." },
  { status: 503 },
);
const checklistWarning = "Le suivi est enregistré, mais les tâches de session n’ont pas pu être synchronisées. Prévenez votre organisme si l’alerte persiste.";


async function trainerAccess(token: string) {
  const admin = getAdminSupabase();
  const { data: access, error } = await admin.from("daily_portal_access_tokens").select("id,portal_type,session_id,status,expires_at,entity_name,entity_email").eq("token", token).maybeSingle();
  if (error) return { ok: false as const, status: 503, error: "Le suivi de session est temporairement indisponible. Réessayez plus tard." };
  if (!access || access.portal_type !== "trainer") return { ok: false as const, status: 403, error: "Accès formateur requis." };
  if (!isValidPortalExpiry(access.expires_at)) return { ok: false as const, status: 410, error: "Ce lien a expiré." };
  if (!["pending", "viewed"].includes(String(access.status ?? ""))) return { ok: false as const, status: 403, error: "Cet accès n’est plus actif." };
  const { data: session, error: sessionError } = await admin.from("daily_sessions").select("id,organisation_id").eq("id", access.session_id).neq("status", "archived").maybeSingle();
  if (sessionError) return { ok: false as const, status: 503, error: "Le suivi de session est temporairement indisponible. Réessayez plus tard." };
  if (!session) return { ok: false as const, status: 404, error: "Session introuvable." };
  return { ok: true as const, admin, access, session };
}

async function refreshFollowupChecklist(admin: ReturnType<typeof getAdminSupabase>, organisationId: string, sessionId: string): Promise<boolean> {
  try {
    const [slotsResult, recordsResult, entriesResult] = await Promise.all([
      admin.from("daily_attendance_slots").select("status").eq("organisation_id", organisationId).eq("session_id", sessionId),
      admin.from("daily_attendance_records").select("status").eq("organisation_id", organisationId).eq("session_id", sessionId),
      admin.from("daily_session_followup_entries").select("id", { count: "exact", head: true }).eq("organisation_id", organisationId).eq("session_id", sessionId).eq("status", "open"),
    ]);
    // A missing count or a failed read is not evidence that all incidents are resolved.
    if (slotsResult.error || recordsResult.error || entriesResult.error || typeof entriesResult.count !== "number") return false;
    const slots = slotsResult.data ?? [];
    const records = recordsResult.data ?? [];
    const openEntries = entriesResult.count;
    const allSlotsClosed = slots.length > 0 && slots.every((slot) => ["closed", "cancelled"].includes(slot.status));
    const allRecordsDecided = records.length > 0 && records.every((record) => record.status !== "pending");
    const hasAttendanceActivity = slots.some((slot) => slot.status !== "draft") || records.some((record) => record.status !== "pending");
    const status = openEntries === 0 && allSlotsClosed && allRecordsDecided ? "to_review" : (openEntries > 0 || hasAttendanceActivity ? "in_progress" : "todo");
    const { error } = await admin.from("daily_session_checklist_items").update({ status })
      .eq("organisation_id", organisationId).eq("session_id", sessionId)
      .eq("item_key", "attendance_followup").neq("status", "not_applicable");
    return !error;
  } catch {
    return false;
  }
}

async function savedFollowupResponse(
  admin: ReturnType<typeof getAdminSupabase>,
  organisationId: string,
  sessionId: string,
  entry: unknown,
  status = 200,
  replayed = false,
) {
  const checklistSynced = await refreshFollowupChecklist(admin, organisationId, sessionId);
  return portalResponse({
    entry,
    ...(replayed ? { replayed: true } : {}),
    checklist_synced: checklistSynced,
    ...(checklistSynced ? {} : { warning: checklistWarning }),
  }, { status });
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params; const auth = await trainerAccess(text(token));
  if (!auth.ok) return portalResponse({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.admin.from("daily_session_followup_entries").select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,author_role,author_name").eq("organisation_id", auth.session.organisation_id).eq("session_id", auth.access.session_id).order("occurred_at", { ascending: false });
  if (error) return transientError();
  return portalResponse({ entries: data ?? [] });
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params; const auth = await trainerAccess(text(token));
  if (!auth.ok) return portalResponse({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const entryType = text(body.entry_type), level = text(body.level), summary = text(body.summary), enrolmentId = text(body.enrolment_id), requestId = text(body.request_id);
  if (!ENTRY_TYPES.has(entryType) || !LEVELS.has(level) || !summary) return portalResponse({ error: "Type, niveau et constat sont requis." }, { status: 400 });
  if (!UUID_PATTERN.test(requestId)) return portalResponse({ error: "Identifiant de requête invalide." }, { status: 400 });
  if (ATTENDANCE_ENTRY_TYPES.has(entryType)) {
    if (!enrolmentId) return portalResponse({ error: "Apprenant requis pour ce signalement." }, { status: 400 });
  }
  if (enrolmentId) {
    const { data: enrolment, error: enrolmentError } = await auth.admin.from("daily_session_enrolments").select("id,status").eq("id", enrolmentId).eq("session_id", auth.access.session_id).eq("organisation_id", auth.session.organisation_id).maybeSingle();
    if (enrolmentError) return transientError();
    if (!enrolment || INACTIVE_ENROLMENTS.has(text(enrolment.status))) return portalResponse({ error: "Inscription introuvable ou inactive." }, { status: 404 });
  }
  const authorName = text(auth.access.entity_name) || text(auth.access.entity_email) || "Formateur";
  const { data, error } = await auth.admin.from("daily_session_followup_entries").insert({ id: requestId, organisation_id: auth.session.organisation_id, session_id: auth.access.session_id, enrolment_id: enrolmentId || null, entry_type: entryType, level, summary, description: text(body.description) || null, action_taken: text(body.action_taken) || null, status: "open", author_role: "Formateur", author_name: authorName }).select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,author_role,author_name").single();
  if (error?.code === "23505") {
    const { data: replay, error: replayError } = await auth.admin.from("daily_session_followup_entries")
      .select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,author_role,author_name")
      .eq("id", requestId).eq("organisation_id", auth.session.organisation_id).eq("session_id", auth.access.session_id).maybeSingle();
    if (replayError) return transientError();
    if (replay) return savedFollowupResponse(auth.admin, auth.session.organisation_id, auth.access.session_id, replay, 200, true);
    return portalResponse({ error: "Ce signalement ne peut pas être rejoué. Rechargez la page." }, { status: 409 });
  }
  if (error) return transientError();
  return savedFollowupResponse(auth.admin, auth.session.organisation_id, auth.access.session_id, data, 201);
}

export async function PATCH(request: Request, { params }: Params) {
  const { token } = await params; const auth = await trainerAccess(text(token));
  if (!auth.ok) return portalResponse({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>; const id = text(body.id), actionTaken = text(body.action_taken);
  if (!id || !actionTaken) return portalResponse({ error: "Suivi et action réalisée sont requis." }, { status: 400 });
  const { data, error } = await auth.admin.from("daily_session_followup_entries").update({ action_taken: actionTaken, status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id).eq("organisation_id", auth.session.organisation_id).eq("session_id", auth.access.session_id).eq("status", "open").select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,author_role,author_name").maybeSingle();
  if (error) return transientError();
  if (!data) return portalResponse({ error: "Suivi déjà traité ou introuvable." }, { status: 404 });
  return savedFollowupResponse(auth.admin, auth.session.organisation_id, auth.access.session_id, data);
}
