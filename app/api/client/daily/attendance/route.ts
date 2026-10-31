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
import { ensurePosttrainingDocuments } from "@/lib/server/dailyPosttrainingDocuments";
import { refreshDailyAttendanceChecklist } from "@/lib/server/dailyAttendanceChecklist";

function text(body: Record<string, unknown>, key: string) {
  return String(body[key] ?? "").trim();
}

function activeEnrolment(status?: string | null) {
  return status !== "declined" && status !== "cancelled" && status !== "abandoned";
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

async function tryEnsurePosttrainingDocuments(
  admin: ReturnType<typeof import("@/lib/server/clientNdaAccess").getAdminSupabase>,
  organisationId: string,
  userId: string,
  sessionId: string,
) {
  try {
    await ensurePosttrainingDocuments({ admin, organisationId, userId, sessionId });
  } catch (error) {
    console.error("[daily] automatic post-training document generation failed after attendance update", error);
  }
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

  const [{ data: slots, error: slotsError }, { data: enrolments, error: enrolmentsError }, { data: communications, error: communicationsError }] = await Promise.all([
    admin
      .from("daily_attendance_slots")
      .select("id,slot_key,slot_date,starts_at,ends_at,mode,label,status,created_at,daily_attendance_access_tokens(id,access_type,enrolment_id,channel,status,expires_at,last_used_at),daily_attendance_records(id,enrolment_id,status,signed_at,validated_at,validated_by,evidence_metadata,updated_at)")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId)
      .order("slot_date", { ascending: true })
      .order("starts_at", { ascending: true }),
    admin
      .from("daily_session_enrolments")
      .select("id,learner_id,status,daily_learners(id,first_name,last_name,email)")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId),
    admin
      .from("daily_communications")
      .select("id,enrolment_id,communication_type,status,sent_at,created_at,metadata")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId)
      .in("communication_type", ["attendance_request", "attendance_reminder", "attendance_correction_request"])
      .in("status", ["queued", "sent", "delivered"]),
  ]);
  if (slotsError) throw new Error(slotsError.message);
  if (enrolmentsError) throw new Error(enrolmentsError.message);
  if (communicationsError) throw new Error(communicationsError.message);

  return {
    session,
    slots: slots ?? [],
    enrolments: (enrolments ?? []).filter((enrolment) => activeEnrolment(enrolment.status)),
    communications: communications ?? [],
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
    const { data: existingSlots, error: existingSlotsError } = await context.admin
      .from("daily_attendance_slots")
      .select("id,slot_key,status")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId);
    if (existingSlotsError) return NextResponse.json({ error: existingSlotsError.message }, { status: 500 });
    const existingByKey = new Map((existingSlots ?? []).map((slot) => [slot.slot_key, slot]));
    const desiredKeys = new Set<string>();

    for (let index = 0; index < blocks.length; index += 1) {
      const raw = blocks[index];
      const block = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const date = String(block.date ?? "").trim();
      const start = String(block.start ?? "").trim();
      const end = String(block.end ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) continue;
      const key = slotKey({ date, start, end }, index);
      desiredKeys.add(key);
      const existingSlot = existingByKey.get(key);
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
          status: existingSlot && existingSlot.status !== "cancelled" ? existingSlot.status : "draft",
          created_by: context.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "session_id,slot_key" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const obsoleteActiveIds = (existingSlots ?? [])
      .filter((slot) => !desiredKeys.has(slot.slot_key) && ["draft", "open"].includes(slot.status))
      .map((slot) => slot.id);
    if (obsoleteActiveIds.length > 0) {
      const { error: cancelError } = await context.admin
        .from("daily_attendance_slots")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("organisation_id", context.organisationId)
        .eq("session_id", sessionId)
        .in("id", obsoleteActiveIds);
      if (cancelError) return NextResponse.json({ error: cancelError.message }, { status: 500 });
      const { error: revokeError } = await context.admin
        .from("daily_attendance_access_tokens")
        .update({ status: "revoked" })
        .eq("organisation_id", context.organisationId)
        .eq("session_id", sessionId)
        .in("slot_id", obsoleteActiveIds)
        .eq("status", "active");
      if (revokeError) return NextResponse.json({ error: revokeError.message }, { status: 500 });
    }

    const [{ data: slots, error: slotsReadError }, { data: enrolments, error: enrolmentsReadError }] = await Promise.all([
      context.admin.from("daily_attendance_slots").select("id,slot_key,status").eq("organisation_id", context.organisationId).eq("session_id", sessionId),
      context.admin.from("daily_session_enrolments").select("id,status").eq("organisation_id", context.organisationId).eq("session_id", sessionId),
    ]);
    if (slotsReadError || enrolmentsReadError) {
      return NextResponse.json({ error: "Impossible de vérifier les créneaux et inscriptions pour préparer l’émargement. Réessayez." }, { status: 503 });
    }
    const currentSlots = (slots ?? []).filter((slot) => desiredKeys.has(slot.slot_key) && slot.status !== "cancelled");
    const rows = currentSlots.flatMap((slot) =>
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
    await refreshDailyAttendanceChecklist(context.admin, context.organisationId, sessionId);
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
    if (["closed", "cancelled"].includes(slot.status)) {
      return NextResponse.json({ error: "Ce créneau est fermé ou annulé. Aucun nouveau lien ne peut être créé." }, { status: 409 });
    }

    const individual = slot.mode === "distanciel_asynchrone" || Boolean(enrolmentId);
    if (individual && !enrolmentId) {
      return NextResponse.json({ error: "Un apprenant est requis pour ce lien individuel." }, { status: 400 });
    }
    if (enrolmentId) {
      const { data: enrolment, error: enrolmentError } = await context.admin
        .from("daily_session_enrolments")
        .select("id,status")
        .eq("organisation_id", context.organisationId)
        .eq("session_id", sessionId)
        .eq("id", enrolmentId)
        .maybeSingle();
      if (enrolmentError) {
        return NextResponse.json({ error: "Impossible de vérifier l’inscription pour cet émargement. Réessayez." }, { status: 503 });
      }
      if (!enrolment || !activeEnrolment(enrolment.status)) {
        return NextResponse.json({ error: "Inscription introuvable ou inactive." }, { status: 404 });
      }
    }

    // Prepare the replacement before invalidating a link already in use.
    // The token_hash is unique; the new secret is not disclosed until rotation succeeds.
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
    if (tokenError) {
      return NextResponse.json({ error: "Impossible de préparer le nouveau lien d’émargement. Réessayez." }, { status: 503 });
    }

    let revoke = context.admin
      .from("daily_attendance_access_tokens")
      .update({ status: "revoked" })
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("slot_id", slotId)
      .eq("status", "active")
      .neq("token_hash", tokenHash);
    revoke = enrolmentId ? revoke.eq("enrolment_id", enrolmentId) : revoke.is("enrolment_id", null);
    const { error: revokeError } = await revoke;
    if (revokeError) {
      // Best-effort compensation: never expose a replacement when old links
      // could not be revoked. The existing link remains valid on SQL failure.
      const { error: rollbackError } = await context.admin
        .from("daily_attendance_access_tokens")
        .update({ status: "revoked" })
        .eq("organisation_id", context.organisationId)
        .eq("session_id", sessionId)
        .eq("slot_id", slotId)
        .eq("token_hash", tokenHash)
        .eq("status", "active");
      if (rollbackError) {
        console.error("[daily] attendance link replacement compensation failed", rollbackError);
      }
      return NextResponse.json({ error: "Impossible de renouveler ce lien d’émargement. Réessayez." }, { status: 503 });
    }
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
    const { error: revokeError } = await context.admin
      .from("daily_attendance_access_tokens")
      .update({ status: "revoked" })
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("slot_id", slotId)
      .eq("status", "active");
    if (revokeError) {
      return NextResponse.json({ error: "Créneau fermé, mais la révocation des liens n’a pas pu être confirmée. Réessayez." }, { status: 503 });
    }
    await refreshDailyAttendanceChecklist(context.admin, context.organisationId, sessionId);
    await tryEnsurePosttrainingDocuments(context.admin, context.organisationId, context.user.id, sessionId);
    return NextResponse.json({ ok: true });
  }

  if (action === "set_absence") {
    const slotId = text(body, "slot_id");
    const enrolmentId = text(body, "enrolment_id");
    const status = text(body, "status");
    if (!slotId || !enrolmentId || !["absent", "excused", "pending"].includes(status)) {
      return NextResponse.json({ error: "Données d'absence invalides." }, { status: 400 });
    }
    const { data: currentRecord, error: currentRecordError } = await context.admin
      .from("daily_attendance_records")
      .select("id,status,updated_at,evidence_metadata")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("slot_id", slotId)
      .eq("enrolment_id", enrolmentId)
      .maybeSingle();
    if (currentRecordError) {
      return NextResponse.json({ error: "Impossible de vérifier cet émargement. Réessayez." }, { status: 503 });
    }
    if (!currentRecord) return NextResponse.json({ error: "Émargement introuvable." }, { status: 404 });
    if (currentRecord.status === "present") {
      return NextResponse.json({ error: "Une présence signée ne peut pas être remplacée par une absence." }, { status: 409 });
    }
    const currentMetadata = currentRecord?.evidence_metadata && typeof currentRecord.evidence_metadata === "object"
      ? currentRecord.evidence_metadata as Record<string, unknown>
      : {};
    const currentReview = currentMetadata.late_review && typeof currentMetadata.late_review === "object"
      ? currentMetadata.late_review as Record<string, unknown>
      : {};
    if (currentMetadata.late_attendance === true && currentReview.state === "awaiting_validation") {
      return NextResponse.json({ error: "Validez ou rejetez d’abord la preuve de régularisation soumise." }, { status: 409 });
    }
    // Compare the version read above: a signature or correction arriving concurrently
    // must not be overwritten by an absence decision based on stale evidence.
    let update = context.admin
      .from("daily_attendance_records")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", currentRecord.id)
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("slot_id", slotId)
      .eq("enrolment_id", enrolmentId)
      .neq("status", "present");
    update = currentRecord.updated_at
      ? update.eq("updated_at", currentRecord.updated_at)
      : update.is("updated_at", null);
    const { data: updated, error } = await update.select("id").maybeSingle();
    if (error) {
      return NextResponse.json({ error: "Impossible de modifier cet émargement. Réessayez." }, { status: 503 });
    }
    if (!updated) {
      return NextResponse.json({ error: "Cet émargement a changé entre-temps. Rechargez la page." }, { status: 409 });
    }
    await refreshDailyAttendanceChecklist(context.admin, context.organisationId, sessionId);
    await tryEnsurePosttrainingDocuments(context.admin, context.organisationId, context.user.id, sessionId);
    return NextResponse.json({ ok: true });
  }

  if (action === "review_late_attendance") {
    const slotId = text(body, "slot_id");
    const enrolmentId = text(body, "enrolment_id");
    const decision = text(body, "decision");
    const reason = text(body, "reason");
    if (!slotId || !enrolmentId || !["validate", "reject"].includes(decision)) {
      return NextResponse.json({ error: "Décision de validation invalide." }, { status: 400 });
    }
    if (decision === "reject" && reason.length < 3) {
      return NextResponse.json({ error: "Le motif du rejet est obligatoire." }, { status: 400 });
    }
    const { data: current, error: currentError } = await context.admin
      .from("daily_attendance_records")
      .select("id,status,signed_at,validated_at,validated_by,evidence_metadata,updated_at")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("slot_id", slotId)
      .eq("enrolment_id", enrolmentId)
      .maybeSingle();
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
    if (!current) return NextResponse.json({ error: "Émargement introuvable." }, { status: 404 });
    const metadata = current.evidence_metadata && typeof current.evidence_metadata === "object"
      ? current.evidence_metadata as Record<string, unknown>
      : {};
    const review = metadata.late_review && typeof metadata.late_review === "object"
      ? metadata.late_review as Record<string, unknown>
      : {};
    if (metadata.late_attendance !== true || current.status !== "pending" || !current.signed_at || review.state !== "awaiting_validation") {
      return NextResponse.json({ error: "Cette régularisation n’est plus en attente de validation." }, { status: 409 });
    }
    const decidedAt = new Date().toISOString();
    const reviewerId = context.assisted ? context.assistance.agent_user_id : context.user.id;
    const reviewerEmail = context.assisted ? context.assistance.agent_email : context.user.email;
    const version = Number(review.version) || 1;
    const versions = (Array.isArray(review.versions) ? review.versions : []).map((item) => {
      if (!item || typeof item !== "object" || Number((item as Record<string, unknown>).version) !== version) return item;
      return {
        ...(item as Record<string, unknown>),
        decision: decision === "validate" ? "validated" : "rejected",
        decided_at: decidedAt,
        decided_by: reviewerId,
        decided_by_email: reviewerEmail,
        reason: decision === "reject" ? reason : null,
      };
    });
    const nextMetadata = {
      ...metadata,
      late_review: {
        ...review,
        state: decision === "validate" ? "validated" : "rejected",
        rejection_reason: decision === "reject" ? reason : null,
        decided_at: decidedAt,
        decided_by: reviewerId,
        decided_by_email: reviewerEmail,
        reviewer_mode: context.assisted ? "studio_assistance" : "daily_organisation",
        versions,
      },
    };
    const patch = decision === "validate"
      ? { status: "present", validated_at: decidedAt, validated_by: reviewerId, evidence_metadata: nextMetadata, updated_at: decidedAt }
      : { status: "pending", validated_at: null, validated_by: null, evidence_metadata: nextMetadata, updated_at: decidedAt };
    const { data: updated, error: updateError } = await context.admin
      .from("daily_attendance_records")
      .update(patch)
      .eq("id", current.id)
      .eq("updated_at", current.updated_at)
      .select("id")
      .maybeSingle();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "La régularisation a changé entre-temps. Rechargez la page." }, { status: 409 });
    await refreshDailyAttendanceChecklist(context.admin, context.organisationId, sessionId);
    await tryEnsurePosttrainingDocuments(context.admin, context.organisationId, context.user.id, sessionId);
    return NextResponse.json({ ok: true, reviewState: decision === "validate" ? "validated" : "rejected", decidedAt, version });
  }

  return NextResponse.json({ error: "Action d'émargement inconnue." }, { status: 400 });
}
