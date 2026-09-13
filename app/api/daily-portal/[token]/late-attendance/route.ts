import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import {
  DAILY_ATTENDANCE_CONSENT,
  buildAttendanceProofHash,
  hashAttendanceSignature,
  signatureBufferFromDataUrl,
} from "@/lib/server/dailyAttendance";

type Params = { params: Promise<{ token: string }> };
const INACTIVE = new Set(["declined", "cancelled", "abandoned"]);
const clean = (value: unknown) => String(value ?? "").trim();
const normalizeEmail = (value: unknown) => clean(value).toLowerCase();

function slotEnded(slot: { slot_date: string; ends_at: string }) {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (slot.slot_date < today) return true;
  if (slot.slot_date > today) return false;
  const [hour, minute] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now).split(":").map(Number);
  const [endHour, endMinute] = slot.ends_at.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute > endHour * 60 + endMinute;
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const cleanToken = clean(token);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const slotId = clean(body.slot_id);
  if (!cleanToken || !slotId) return NextResponse.json({ error: "Créneau invalide." }, { status: 400 });
  if (body.consent !== true) return NextResponse.json({ error: "Le consentement est obligatoire." }, { status: 400 });
  const signature = signatureBufferFromDataUrl(clean(body.signature_data));
  if (!signature) return NextResponse.json({ error: "La signature dessinée est obligatoire." }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user?.id || !authData.user.email) {
    return NextResponse.json({ error: "Connexion apprenant requise." }, { status: 401 });
  }

  const admin = getAdminSupabase();
  const { data: access, error: accessError } = await admin
    .from("daily_portal_access_tokens")
    .select("id,session_id,portal_type,entity_email,status,expires_at")
    .eq("token", cleanToken)
    .maybeSingle();
  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 500 });
  if (!access || access.portal_type !== "learner") return NextResponse.json({ error: "Accès apprenant introuvable." }, { status: 403 });
  if (!["pending", "viewed"].includes(clean(access.status))) return NextResponse.json({ error: "Cet accès n’est plus actif." }, { status: 410 });
  if (access.expires_at && new Date(access.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: "Cet accès a expiré." }, { status: 410 });
  if (normalizeEmail(authData.user.email) !== normalizeEmail(access.entity_email)) {
    return NextResponse.json({ error: "Ce portail n’est pas associé au compte connecté." }, { status: 403 });
  }

  const { data: session, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,status")
    .eq("id", access.session_id)
    .neq("status", "archived")
    .maybeSingle();
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  const { data: learner, error: learnerError } = await admin
    .from("daily_learners")
    .select("id,email")
    .eq("organisation_id", session.organisation_id)
    .ilike("email", normalizeEmail(access.entity_email))
    .maybeSingle();
  if (learnerError) return NextResponse.json({ error: learnerError.message }, { status: 500 });
  if (!learner) return NextResponse.json({ error: "Apprenant introuvable." }, { status: 404 });

  const { data: enrolment, error: enrolmentError } = await admin
    .from("daily_session_enrolments")
    .select("id,status")
    .eq("organisation_id", session.organisation_id)
    .eq("session_id", session.id)
    .eq("learner_id", learner.id)
    .maybeSingle();
  if (enrolmentError) return NextResponse.json({ error: enrolmentError.message }, { status: 500 });
  if (!enrolment || INACTIVE.has(clean(enrolment.status))) return NextResponse.json({ error: "Inscription inactive ou introuvable." }, { status: 404 });

  const { data: slot, error: slotError } = await admin
    .from("daily_attendance_slots")
    .select("id,slot_date,starts_at,ends_at,status")
    .eq("id", slotId)
    .eq("organisation_id", session.organisation_id)
    .eq("session_id", session.id)
    .maybeSingle();
  if (slotError) return NextResponse.json({ error: slotError.message }, { status: 500 });
  if (!slot || slot.status === "cancelled") return NextResponse.json({ error: "Créneau introuvable ou annulé." }, { status: 404 });
  if (!slotEnded(slot)) return NextResponse.json({ error: "Ce créneau n’est pas encore terminé." }, { status: 409 });

  const { data: current, error: recordReadError } = await admin
    .from("daily_attendance_records")
    .select("status,signed_at")
    .eq("slot_id", slot.id)
    .eq("enrolment_id", enrolment.id)
    .maybeSingle();
  if (recordReadError) return NextResponse.json({ error: recordReadError.message }, { status: 500 });
  if (current?.status === "present") return NextResponse.json({ ok: true, alreadySigned: true, signedAt: current.signed_at });
  if (current?.status && current.status !== "pending") {
    return NextResponse.json({ error: "Ce créneau possède déjà un statut de présence. L’organisme doit le vérifier avant toute modification." }, { status: 409 });
  }

  const signedAt = new Date().toISOString();
  const signatureSha256 = hashAttendanceSignature(signature);
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent");
  const proofSha256 = buildAttendanceProofHash({
    organisationId: session.organisation_id,
    sessionId: session.id,
    slotId: slot.id,
    enrolmentId: enrolment.id,
    signedAt,
    consentText: DAILY_ATTENDANCE_CONSENT,
    signatureSha256,
    ipAddress,
    userAgent,
  });
  const storagePath = `daily-attendance/${session.organisation_id}/${session.id}/${slot.id}/${enrolment.id}/${Date.now()}-${randomUUID()}.png`;
  const { error: uploadError } = await admin.storage.from("documents").upload(storagePath, signature, { contentType: "image/png", upsert: false });
  if (uploadError) return NextResponse.json({ error: "La preuve de signature n’a pas pu être conservée." }, { status: 500 });

  const { error: recordError } = await admin.from("daily_attendance_records").upsert({
    organisation_id: session.organisation_id,
    session_id: session.id,
    slot_id: slot.id,
    enrolment_id: enrolment.id,
    status: "present",
    consent_text: DAILY_ATTENDANCE_CONSENT,
    signature_storage_path: storagePath,
    signature_sha256: signatureSha256,
    proof_sha256: proofSha256,
    signed_at: signedAt,
    ip_address: ipAddress,
    user_agent: userAgent,
    evidence_metadata: {
      channel: "authenticated_portal",
      access_type: "learner_portal",
      late_attendance: true,
      slot_date: slot.slot_date,
      slot_starts_at: slot.starts_at,
      slot_ends_at: slot.ends_at,
      recorded_at: signedAt,
    },
    updated_at: signedAt,
  }, { onConflict: "slot_id,enrolment_id" });
  if (recordError) {
    await admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: recordError.message }, { status: 500 });
  }

  await admin.from("daily_session_checklist_items")
    .update({ status: "in_progress" })
    .eq("organisation_id", session.organisation_id)
    .eq("session_id", session.id)
    .eq("item_key", "attendance_followup")
    .eq("status", "todo");

  return NextResponse.json({ ok: true, signedAt, late: true });
}
