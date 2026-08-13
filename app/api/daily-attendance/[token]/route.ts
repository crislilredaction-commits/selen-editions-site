import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { DAILY_ATTENDANCE_CONSENT, hashAttendanceToken } from "@/lib/server/dailyAttendance";

type Params = { params: Promise<{ token: string }> };

function formationTitle(value: unknown) {
  if (Array.isArray(value)) return value[0]?.title ?? "Formation Selen Daily";
  if (value && typeof value === "object" && "title" in value) {
    return String((value as { title?: unknown }).title ?? "Formation Selen Daily");
  }
  return "Formation Selen Daily";
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const rawToken = String(token ?? "").trim();
  if (!rawToken) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const admin = getAdminSupabase();
  const { data: access, error: accessError } = await admin
    .from("daily_attendance_access_tokens")
    .select("id,organisation_id,session_id,slot_id,enrolment_id,access_type,channel,status,expires_at")
    .eq("token_hash", hashAttendanceToken(rawToken))
    .maybeSingle();
  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 500 });
  if (!access) return NextResponse.json({ error: "Lien d'émargement introuvable." }, { status: 404 });
  if (access.status !== "active" || new Date(access.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Ce lien d'émargement n'est plus actif." }, { status: 410 });
  }

  const [{ data: slot, error: slotError }, { data: session, error: sessionError }] = await Promise.all([
    admin
      .from("daily_attendance_slots")
      .select("id,slot_date,starts_at,ends_at,mode,label,status")
      .eq("id", access.slot_id)
      .eq("session_id", access.session_id)
      .maybeSingle(),
    admin
      .from("daily_sessions")
      .select("id,internal_reference,modality,start_date,end_date,daily_formations(id,title)")
      .eq("id", access.session_id)
      .eq("organisation_id", access.organisation_id)
      .maybeSingle(),
  ]);
  if (slotError) return NextResponse.json({ error: slotError.message }, { status: 500 });
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!slot || !session || slot.status === "closed" || slot.status === "cancelled") {
    return NextResponse.json({ error: "Ce créneau d'émargement n'est plus disponible." }, { status: 410 });
  }

  let learner = null;
  let alreadySigned = false;
  let signedAt = null;
  if (access.access_type === "individual" && access.enrolment_id) {
    const { data: enrolment } = await admin
      .from("daily_session_enrolments")
      .select("id,learner_id,status")
      .eq("organisation_id", access.organisation_id)
      .eq("session_id", access.session_id)
      .eq("id", access.enrolment_id)
      .maybeSingle();
    if (!enrolment || ["declined", "cancelled"].includes(enrolment.status)) {
      return NextResponse.json({ error: "Inscription introuvable." }, { status: 404 });
    }
    const [{ data: learnerRow }, { data: record }] = await Promise.all([
      admin.from("daily_learners").select("first_name,last_name,email").eq("id", enrolment.learner_id).maybeSingle(),
      admin.from("daily_attendance_records").select("status,signed_at").eq("slot_id", access.slot_id).eq("enrolment_id", enrolment.id).maybeSingle(),
    ]);
    learner = learnerRow;
    alreadySigned = record?.status === "present";
    signedAt = record?.signed_at ?? null;
  }

  await admin.from("daily_attendance_access_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", access.id);

  return NextResponse.json({
    accessType: access.access_type,
    channel: access.channel,
    session: {
      title: formationTitle(session.daily_formations),
      reference: session.internal_reference,
      modality: session.modality,
      startDate: session.start_date,
      endDate: session.end_date,
    },
    slot,
    learner,
    alreadySigned,
    signedAt,
    consentText: DAILY_ATTENDANCE_CONSENT,
  });
}
