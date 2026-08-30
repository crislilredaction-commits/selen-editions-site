import { NextResponse } from "next/server";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

const ENTRY_TYPES = new Set(["incident", "adaptation", "note"]);
const LEVELS = new Set(["info", "attention", "critical"]);

function text(body: Record<string, unknown>, key: string) {
  return String(body[key] ?? "").trim();
}

function trainerIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function normalizedEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function getTrainerContext() {
  const workspace = await getDailyClientWorkspace();
  if (!workspace.ok) return workspace;
  if (!workspace.workspace.capabilities.trainer_self) {
    return { ok: false as const, status: 403, error: "Cet espace est réservé au formateur concerné." };
  }

  const trainer = workspace.workspace.trainers.find((item) => String(item.user_id ?? "") === workspace.user.id)
    ?? workspace.workspace.trainers[0];
  if (!trainer?.id) {
    return { ok: false as const, status: 404, error: "Fiche formateur introuvable." };
  }

  return {
    ok: true as const,
    admin: getAdminSupabase(),
    user: workspace.user,
    organisationId: workspace.workspace.membership.organisation_id,
    trainerProfileId: String(trainer.id),
    trainerName: String(trainer.display_name ?? trainer.professional_email ?? workspace.user.email ?? "Formateur").trim() || "Formateur",
  };
}

async function getAssignedSession(
  admin: ReturnType<typeof getAdminSupabase>,
  organisationId: string,
  trainerProfileId: string,
  sessionId: string,
) {
  const { data, error } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,formation_id,internal_reference,start_date,end_date,status,trainer_ids,daily_formations(id,title)")
    .eq("organisation_id", organisationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !trainerIds(data.trainer_ids).includes(trainerProfileId)) return null;
  return data;
}

async function refreshFollowupChecklist(
  admin: ReturnType<typeof getAdminSupabase>,
  organisationId: string,
  sessionId: string,
) {
  const [{ data: slots }, { data: records }, { count: openOperationalEntries }] = await Promise.all([
    admin.from("daily_attendance_slots").select("status").eq("organisation_id", organisationId).eq("session_id", sessionId),
    admin.from("daily_attendance_records").select("status").eq("organisation_id", organisationId).eq("session_id", sessionId),
    admin.from("daily_session_followup_entries").select("id", { count: "exact", head: true }).eq("organisation_id", organisationId).eq("session_id", sessionId).eq("status", "open").in("entry_type", ["incident", "adaptation"]),
  ]);

  const allSlotsClosed = (slots ?? []).length > 0 && (slots ?? []).every((slot) => ["closed", "cancelled"].includes(slot.status));
  const allRecordsDecided = (records ?? []).length > 0 && (records ?? []).every((record) => record.status !== "pending");
  const hasAttendanceActivity = (slots ?? []).some((slot) => slot.status !== "draft") || (records ?? []).some((record) => record.status !== "pending");
  let status = "todo";
  if ((openOperationalEntries ?? 0) > 0 || hasAttendanceActivity) status = "in_progress";
  if ((openOperationalEntries ?? 0) === 0 && allSlotsClosed && allRecordsDecided) status = "to_review";

  await admin.from("daily_session_checklist_items").update({ status }).eq("organisation_id", organisationId).eq("session_id", sessionId).eq("item_key", "attendance_followup").neq("status", "not_applicable");
}

export async function GET(request: Request) {
  const context = await getTrainerContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id")?.trim() || "";

  if (!sessionId) {
    const { data, error } = await context.admin.from("daily_sessions").select("id,internal_reference,start_date,end_date,status,trainer_ids,daily_formations(id,title)").eq("organisation_id", context.organisationId).neq("status", "archived").order("start_date", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const sessions = (data ?? []).filter((session) => trainerIds(session.trainer_ids).includes(context.trainerProfileId));
    return NextResponse.json({ sessions });
  }

  const session = await getAssignedSession(context.admin, context.organisationId, context.trainerProfileId, sessionId).catch(() => null);
  if (!session) return NextResponse.json({ error: "Session introuvable ou non affectée à ce formateur." }, { status: 404 });

  const [{ data: entries, error: entriesError }, { data: enrolments, error: enrolmentsError }, { data: portalRows, error: portalError }] = await Promise.all([
    context.admin.from("daily_session_followup_entries").select("id,session_id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,created_by,author_role,author_name,created_at,updated_at").eq("organisation_id", context.organisationId).eq("session_id", sessionId).order("occurred_at", { ascending: false }),
    context.admin.from("daily_session_enrolments").select("id,status,daily_learners(id,first_name,last_name,email)").eq("organisation_id", context.organisationId).eq("session_id", sessionId).not("status", "in", "(cancelled,declined)"),
    context.admin.from("daily_portal_access_tokens").select("id,session_id,entity_name,entity_email,token,status,expires_at,last_viewed_at").eq("session_id", sessionId).eq("portal_type", "learner").not("status", "eq", "expired"),
  ]);
  if (entriesError || enrolmentsError || portalError) {
    return NextResponse.json({ error: entriesError?.message ?? enrolmentsError?.message ?? portalError?.message }, { status: 500 });
  }

  const enrolmentRows = enrolments ?? [];
  const portalAccess = enrolmentRows.flatMap((enrolment) => {
    const learnerValue = enrolment.daily_learners;
    const learner = Array.isArray(learnerValue) ? learnerValue[0] : learnerValue;
    const learnerEmail = normalizedEmail(learner?.email);
    const learnerName = [learner?.first_name, learner?.last_name].map((part) => String(part ?? "").trim()).filter(Boolean).join(" ").toLowerCase();
    const portal = (portalRows ?? []).find((row) => {
      const portalEmail = normalizedEmail(row.entity_email);
      const portalName = String(row.entity_name ?? "").trim().toLowerCase();
      return Boolean((learnerEmail && portalEmail === learnerEmail) || (learnerName && portalName === learnerName));
    });
    return portal ? [{ ...portal, enrolment_id: enrolment.id }] : [];
  });

  return NextResponse.json({ session, entries: entries ?? [], enrolments: enrolmentRows, portalAccess });
}

export async function POST(request: Request) {
  const context = await getTrainerContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body, "action") || "create";
  const sessionId = text(body, "session_id");
  if (!sessionId) return NextResponse.json({ error: "Session requise." }, { status: 400 });

  const session = await getAssignedSession(context.admin, context.organisationId, context.trainerProfileId, sessionId).catch(() => null);
  if (!session) return NextResponse.json({ error: "Session introuvable ou non affectée à ce formateur." }, { status: 404 });

  if (action === "create") {
    const entryType = text(body, "entry_type") || "note";
    const requestedLevel = text(body, "level") || "attention";
    const level = entryType === "note" ? "info" : requestedLevel;
    const summary = text(body, "summary");
    const description = text(body, "description") || null;
    const actionTaken = entryType === "note" ? null : (text(body, "action_taken") || null);
    const enrolmentId = text(body, "enrolment_id") || null;
    const occurredAtRaw = text(body, "occurred_at");
    const occurredAt = occurredAtRaw && !Number.isNaN(Date.parse(occurredAtRaw)) ? new Date(occurredAtRaw).toISOString() : new Date().toISOString();

    if (!ENTRY_TYPES.has(entryType)) return NextResponse.json({ error: "Type de suivi invalide." }, { status: 400 });
    if (!LEVELS.has(level)) return NextResponse.json({ error: "Niveau de suivi invalide." }, { status: 400 });
    if (!summary || summary.length > 240) return NextResponse.json({ error: "Le résumé est obligatoire et limité à 240 caractères." }, { status: 400 });

    if (enrolmentId) {
      const { data: enrolment } = await context.admin.from("daily_session_enrolments").select("id,status").eq("organisation_id", context.organisationId).eq("session_id", sessionId).eq("id", enrolmentId).maybeSingle();
      if (!enrolment || ["cancelled", "declined"].includes(enrolment.status)) return NextResponse.json({ error: "Inscription introuvable ou inactive." }, { status: 404 });
    }

    const isNote = entryType === "note";
    const now = new Date().toISOString();
    const { data, error } = await context.admin.from("daily_session_followup_entries").insert({ organisation_id: context.organisationId, session_id: sessionId, enrolment_id: enrolmentId, entry_type: entryType, level, occurred_at: occurredAt, summary, description, action_taken: actionTaken, status: isNote ? "resolved" : "open", created_by: context.user.id, author_role: "Formateur", author_name: context.trainerName, resolved_by: isNote ? context.user.id : null, resolved_at: isNote ? now : null }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!isNote) await refreshFollowupChecklist(context.admin, context.organisationId, sessionId);
    return NextResponse.json({ ok: true, entry: data });
  }

  if (action === "resolve") {
    const id = text(body, "id");
    const actionTaken = text(body, "action_taken");
    if (!id || !actionTaken) return NextResponse.json({ error: "Élément et action réalisée requis." }, { status: 400 });
    const now = new Date().toISOString();
    const { data, error } = await context.admin.from("daily_session_followup_entries").update({ status: "resolved", action_taken: actionTaken, resolved_by: context.user.id, resolved_at: now, updated_at: now }).eq("organisation_id", context.organisationId).eq("session_id", sessionId).eq("id", id).neq("entry_type", "note").eq("status", "open").select("*").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Élément déjà traité ou introuvable." }, { status: 404 });
    await refreshFollowupChecklist(context.admin, context.organisationId, sessionId);
    return NextResponse.json({ ok: true, entry: data });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
