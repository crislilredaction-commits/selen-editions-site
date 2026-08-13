import { NextResponse } from "next/server";
import {
  getDailyOrganisationContext,
  getDailyOrganisationReadContext,
} from "@/lib/server/dailyOrganisationContext";
import {
  attendanceChannel,
  attendanceMode,
  createAttendanceToken,
} from "@/lib/server/dailyAttendance";

function text(body: Record<string, unknown>, key: string) {
  return String(body[key] ?? "").trim();
}

function activeEnrolment(status?: string | null) {
  return status !== "declined" && status !== "cancelled";
}

function modeForBlock(
  session: { modality?: string | null; distance_mode?: string | null },
  requested?: string | null,
) {
  const allowed = new Set(["presentiel", "distanciel_synchrone", "distanciel_asynchrone"]);
  if (requested && allowed.has(requested)) return requested;
  return attendanceMode(session);
}

function slotKey(block: { date?: string; start?: string; end?: string }, index: number) {
  return `${block.date ?? "date"}-${block.start ?? "start"}-${block.end ?? "end"}-${index + 1}`;
}

function linkExpiry(slotDate: string) {
  const date = new Date(`${slotDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 3);
  return date.toISOString();
}

async function refreshChecklist(
  admin: ReturnType<typeof import("@/lib/server/clientNdaAccess").getAdminSupabase>,
  sessionId: string,
  organisationId: string,
) {
  const [{ data: slots }, { data: records }] = await Promise.all([
    admin.from("daily_attendance_slots").select("status").eq("session_id", sessionId),
    admin.from("daily_attendance_records").select("status").eq("session_id", sessionId),
  ]);
  const hasSlots = (slots ?? []).length > 0;
  if (!hasSlots) return;
  const complete =
    (records ?? []).length > 0 &&
    (records ?? []).every((record) => record.status !== "pending") &&
    (slots ?? []).every((slot) => slot.status === "closed" || slot.status === "cancelled");
  await admin
    .from("daily_session_checklist_items")
    .update({ status: complete ? "to_review" : "in_progress" })
    .eq("organisation_id", organisationId)
    .eq("session_id", sessionId)
    .eq("item_key", "attendance_followup")
    .in("status", ["todo", "in_progress", "to_review"]);
}

async function loadSessionOverview(
  admin: ReturnType<typeof import("@/lib/server/clientNdaAccess").getAdminSupabase>,
  organisationId: string,
  sessionId: string,
) {
  const { data: session, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,formation_id,internal_reference,modality,distance_mode,start_date,end_date,schedule_blocks,status,daily_formations(id,title)")
    .eq("organisation_id", organisationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) return null;

  const [{ data: slots, error: slotsError }, { data: enrolments, error: enrolmentsError }] = await Promise.all([
    admin
      .from("daily_attendance_slots")
      .select("id,slot_key,slot_date,starts_at,ends_at,mode,label,status,created_at,daily_attendance_access_tokens(id,access_type,enrolment_id,channel,status,expires_at,last_used_at),daily_attendance_records(id,enrolment_id,status,signed_at,validated_at)")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId)
      .order("slot_date", { ascending: true })
      .order("starts_at", { ascending: true }),
    admin
      .from("daily_session_enrolments")
      .select("id,learner_id,status,daily_learners(id,first_name,last_name,email)")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId),
  ]);
  if (slotsError) throw new Error(slotsError.message);
  if (enrolmentsError) throw new Error(enrolmentsError.message);

  return {
    session,
    slots: slots ?? [],
    enrolments: (enrolments ?? []).filter((enrolment) => activeEnrolment(enrolment.status)),
  };
}

export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.assisted && !context.capabilities?.sessions) {
    return NextResponse.json({ sessions: [], overview: null });
  }

  const sessionId = new URL(req.url).searchParams.get("session_id")?.trim();
  if (sessionId) {
    try {
      const overview = await loadSessionOverview(context.admin, context.organisationId, sessionId);
      if (!overview) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
      return NextResponse.json({ overview });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Lecture impossible." }, { status: 500 });
    }
  }

  const { data, error } = await context.admin
    .from("daily_sessions")
    .select("id,internal_reference,modality,distance_mode,start_date,end_date,status,daily_formations(id,title),daily_attendance_slots(id,status,daily_attendance_records(id,status))")
    .eq("organisation_id", context.organisationId)
    .neq("status", "archived")
    .order("start_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body, "action");
  const sessionId = text(body, "session_id");
  if (!sessionId) return NextResponse.json({ error: "Session requise." }, { status: 400 });

  const { data: session, error: sessionError } = await context.admin
    .from("daily_sessions")
    .select("id,organisation_id,modality,distance_mode,start_date,end_date,schedule_blocks,status")
    .eq("organisation_id", context.organisationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  if (action === "prepare_session") {
    const blocks = Array.isArray(session.schedule_blocks) ? session.schedule_blocks : [];
    if (blocks.length === 0) {
      return NextResponse.json({ error: "La session ne comporte aucun créneau horaire exploitable." }, { status: 400 });
    }
    const requestedModes = body.block_modes && typeof body.block_modes === "object"
      ? body.block_modes as Record<string, string>
      : {};

    for (let index = 0; index < blocks.length; index += 1) {
      const raw = blocks[index];
      const block = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const date = String(block.date ?? "").trim();
      const start = String(block.start ?? "").trim();
      const end = String(block.end ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) continue;
      const key = slotKey({ date, start, end }, index);
      const mode = modeForBlock(session, requestedModes[key]);
      const { error } = await context.admin
        .from("daily_attendance_slots")
        .upsert({
          organisation_id: context.organisationId,
          session_id: sessionId,
          slot_key: key,
          slot_date: date,
          starts_at: start,
          ends_at: end,
          mode,
          label: String(block.note ?? "").trim() || null,
          status: "draft",
          created_by: context.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "session_id,slot_key" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const [{ data: slots }, { data: enrolments }] = await Promise.all([
      context.admin.from("daily_attendance_slots").select("id").eq("organisation_id", context.organisationId).eq("session_id", sessionId),
      context.admin.from("daily_session_enrolments").select("id,status").eq("organisation_id", context.organisationId).eq("session_id", sessionId),
    ]);
    const rows = (slots ?? []).flatMap((slot) =>
      (enrolments ?? []).filter((enrolment) => activeEnrolment(enrolment.status)).map((enrolment) => ({
        organisation_id: context.organisationId,
        session_id: sessionId,
        slot_id: slot.id,
        enrolment_id: enrolment.id,
        status: "pending",
      })),
    );
    if (rows.length > 0) {
      const { error } = await context.admin
        .from("daily_attendance_records")
        .upsert(rows, { onConflict: "slot_id,enrolment_id", ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await refreshChecklist(context.admin, sessionId, context.organisationId);
    const overview = await loadSessionOverview(context.admin, context.organisationId, sessionId);
    return NextResponse.json({ ok: true, overview });
  }

  if (action === "create_link") {
    const slotId = text(body, "slot_id");
    const enrolmentId = text(body, "enrolment_id") || null;
    if (!slotId) return NextResponse.json({ error: "Créneau requis." }, { status: 400 });
    const { data: slot, error: slotError } = await context.admin
      .from("daily_attendance_slots")
      .select("id,slot_date,mode,status")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("id", slotId)
      .maybeSingle();
    if (slotError) return NextResponse.json({ error: slotError.message }, { status: 500 });
    if (!slot) return NextResponse.json({ error: "Créneau introuvable." }, { status: 404 });

    const individual = slot.mode === "distanciel_asynchrone" || Boolean(enrolmentId);
    if (individual && !enrolmentId) {
      return NextResponse.json({ error: "Un apprenant est requis pour ce lien individuel." }, { status: 400 });
    }
    if (enrolmentId) {
      const { data: enrolment } = await context.admin
        .from("daily_session_enrolments")
        .select("id,status")
        .eq("organisation_id", context.organisationId)
        .eq("session_id", sessionId)
        .eq("id", enrolmentId)
        .maybeSingle();
      if (!enrolment || !activeEnrolment(enrolment.status)) {
        return NextResponse.json({ error: "Inscription introuvable ou inactive." }, { status: 404 });
      }
    }

    let revoke = context.admin
      .from("daily_attendance_access_tokens")
      .update({ status: "revoked" })
      .eq("organisation_id", context.organisationId)
      .eq("slot_id", slotId)
      .eq("status", "active");
    revoke = enrolmentId ? revoke.eq("enrolment_id", enrolmentId) : revoke.is("enrolment_id", null);
    const { error: revokeError } = await revoke;
    if (revokeError) return NextResponse.json({ error: revokeError.message }, { status: 500 });

    const { token, tokenHash } = createAttendanceToken();
    const { error: tokenError } = await context.admin.from("daily_attendance_access_tokens").insert({
      organisation_id: context.organisationId,
      session_id: sessionId,
      slot_id: slotId,
      enrolment_id: individual ? enrolmentId : null,
      token_hash: tokenHash,
      access_type: individual ? "individual" : "shared",
      channel: attendanceChannel(slot.mode, individual),
      status: "active",
      expires_at: linkExpiry(slot.slot_date),
      created_by: context.user.id,
    });
    if (tokenError) return NextResponse.json({ error: tokenError.message }, { status: 500 });
    if (slot.status === "draft") {
      await context.admin.from("daily_attendance_slots").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", slotId);
    }
    return NextResponse.json({
      ok: true,
      token,
      path: `/daily-emargement/${token}`,
      channel: attendanceChannel(slot.mode, individual),
      expires_at: linkExpiry(slot.slot_date),
    });
  }

  if (action === "close_slot") {
    const slotId = text(body, "slot_id");
    if (!slotId) return NextResponse.json({ error: "Créneau requis." }, { status: 400 });
    const { error } = await context.admin
      .from("daily_attendance_slots")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("id", slotId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await context.admin
      .from("daily_attendance_access_tokens")
      .update({ status: "revoked" })
      .eq("organisation_id", context.organisationId)
      .eq("slot_id", slotId)
      .eq("status", "active");
    await refreshChecklist(context.admin, sessionId, context.organisationId);
    return NextResponse.json({ ok: true });
  }

  if (action === "set_absence") {
    const slotId = text(body, "slot_id");
    const enrolmentId = text(body, "enrolment_id");
    const status = text(body, "status");
    if (!slotId || !enrolmentId || !["absent", "excused", "pending"].includes(status)) {
      return NextResponse.json({ error: "Données d'absence invalides." }, { status: 400 });
    }
    const { error } = await context.admin
      .from("daily_attendance_records")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("slot_id", slotId)
      .eq("enrolment_id", enrolmentId)
      .neq("status", "present");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await refreshChecklist(context.admin, sessionId, context.organisationId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Action d'émargement inconnue." }, { status: 400 });
}
