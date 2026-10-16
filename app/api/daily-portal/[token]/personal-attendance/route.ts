import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { buildAttendanceSummaryHtml } from "@/lib/server/dailyPosttrainingDocumentHtml";
import {
  attendanceIsSettled,
  isPostsessionDownloadAvailable,
  safePersonalDownloadName,
} from "@/lib/server/dailyPersonalAttendance";

type Params = { params: Promise<{ token: string }> };
type Json = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
const email = (value: unknown) => text(value).toLowerCase();
const one = (value: unknown): Json => Array.isArray(value) ? (value[0] as Json | undefined) ?? {} : value && typeof value === "object" ? value as Json : {};

function isExpired(value: unknown) {
  const expiresAt = text(value);
  return Boolean(expiresAt && Date.parse(expiresAt) < Date.now());
}

export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  const enrolmentId = new URL(request.url).searchParams.get("enrolment") ?? "";
  if (!text(token) || !enrolmentId) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const admin = getAdminSupabase();
  const { data: access, error: accessError } = await admin
    .from("daily_portal_access_tokens")
    .select("session_id,portal_type,entity_email,status,expires_at")
    .eq("token", text(token))
    .maybeSingle();
  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 500 });
  if (!access || access.portal_type !== "learner") return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  if (["revoked", "expired"].includes(text(access.status))) return NextResponse.json({ error: "Cet accès n’est plus actif." }, { status: 403 });
  if (isExpired(access.expires_at)) return NextResponse.json({ error: "Ce lien de portail a expiré." }, { status: 410 });

  const [{ data: session, error: sessionError }, { data: enrolment, error: enrolmentError }] = await Promise.all([
    admin
      .from("daily_sessions")
      .select("id,organisation_id,internal_reference,start_date,end_date,status,daily_formations(title)")
      .eq("id", access.session_id)
      .neq("status", "archived")
      .maybeSingle(),
    admin
      .from("daily_session_enrolments")
      .select("id,organisation_id,session_id,status,daily_learners(first_name,last_name,email)")
      .eq("id", enrolmentId)
      .eq("session_id", access.session_id)
      .not("status", "in", "(declined,cancelled,abandoned)")
      .maybeSingle(),
  ]);
  const readError = sessionError ?? enrolmentError;
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!session || !enrolment || enrolment.organisation_id !== session.organisation_id) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  const learner = one(enrolment.daily_learners);
  if (!email(access.entity_email) || email(learner.email) !== email(access.entity_email)) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  if (!isPostsessionDownloadAvailable(session.end_date)) return NextResponse.json({ error: "Le relevé personnel sera disponible après la fin de la session." }, { status: 409 });

  const [{ data: slots, error: slotsError }, { data: records, error: recordsError }, { data: organisation, error: organisationError }] = await Promise.all([
    admin
      .from("daily_attendance_slots")
      .select("id,slot_date,starts_at,ends_at")
      .eq("organisation_id", session.organisation_id)
      .eq("session_id", session.id)
      .neq("status", "cancelled")
      .order("slot_date")
      .order("starts_at"),
    admin
      .from("daily_attendance_records")
      .select("slot_id,status")
      .eq("organisation_id", session.organisation_id)
      .eq("session_id", session.id)
      .eq("enrolment_id", enrolment.id),
    admin
      .from("organisations")
      .select("name,legal_name,siret,nda_number")
      .eq("id", session.organisation_id)
      .maybeSingle(),
  ]);
  const attendanceError = slotsError ?? recordsError ?? organisationError;
  if (attendanceError) return NextResponse.json({ error: attendanceError.message }, { status: 500 });
  if (!attendanceIsSettled((slots ?? []).map((slot: Json) => slot.id), records ?? [])) {
    return NextResponse.json({ error: "Le relevé personnel sera disponible lorsque toutes vos présences auront été traitées." }, { status: 409 });
  }

  const statusBySlot = new Map((records ?? []).map((record: Json) => [text(record.slot_id), text(record.status)]));
  const learnerName = [text(learner.first_name), text(learner.last_name)].filter(Boolean).join(" ") || email(learner.email) || "Apprenant";
  const formation = one(session.daily_formations);
  const html = buildAttendanceSummaryHtml({
    organisationName: text(organisation?.legal_name || organisation?.name) || "Organisme de formation",
    organisationSiret: text(organisation?.siret),
    organisationNda: text(organisation?.nda_number),
    formationTitle: text(formation.title) || "Formation",
    sessionReference: text(session.internal_reference),
    startDate: text(session.start_date),
    endDate: text(session.end_date),
    generatedAt: new Date(),
    lines: (slots ?? []).map((slot: Json) => ({
      learnerName,
      date: text(slot.slot_date),
      start: text(slot.starts_at).slice(0, 5),
      end: text(slot.ends_at).slice(0, 5),
      status: statusBySlot.get(text(slot.id)) ?? "pending",
      proofHash: null,
    })),
  });
  const filename = safePersonalDownloadName(`releve-presence-${learnerName}`);
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
