import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { attendanceChannel, createAttendanceToken } from "@/lib/server/dailyAttendance";
import { sendDailyAttendanceReminder } from "@/lib/server/dailyAttendanceEmails";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function linkExpiry(slotDate: string) {
  const date = new Date(`${slotDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 3);
  return date.toISOString();
}

function formationTitle(value: unknown) {
  const formation = one(value as { title?: string | null } | { title?: string | null }[] | null);
  return formation?.title || "Formation Selen Daily";
}

export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.assisted) return NextResponse.json({ error: "L’assistance agent est en lecture seule." }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const sessionId = text(body.session_id);
  const slotId = text(body.slot_id);
  const enrolmentId = text(body.enrolment_id);
  if (!sessionId || !slotId || !enrolmentId) {
    return NextResponse.json({ error: "Session, créneau et inscription sont requis." }, { status: 400 });
  }

  const [{ data: session, error: sessionError }, { data: slot, error: slotError }, { data: enrolment, error: enrolmentError }, { data: record, error: recordError }] = await Promise.all([
    context.admin
      .from("daily_sessions")
      .select("id,internal_reference,status,daily_formations(title)")
      .eq("organisation_id", context.organisationId)
      .eq("id", sessionId)
      .maybeSingle(),
    context.admin
      .from("daily_attendance_slots")
      .select("id,slot_date,starts_at,ends_at,mode,label,status")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("id", slotId)
      .maybeSingle(),
    context.admin
      .from("daily_session_enrolments")
      .select("id,status,daily_learners(first_name,last_name,email)")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("id", enrolmentId)
      .maybeSingle(),
    context.admin
      .from("daily_attendance_records")
      .select("status")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("slot_id", slotId)
      .eq("enrolment_id", enrolmentId)
      .maybeSingle(),
  ]);

  const readError = sessionError ?? slotError ?? enrolmentError ?? recordError;
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!session || session.status === "archived") return NextResponse.json({ error: "Session indisponible." }, { status: 404 });
  if (!slot || ["closed", "cancelled"].includes(slot.status)) return NextResponse.json({ error: "Ce créneau n’accepte plus d’émargement." }, { status: 409 });
  if (!enrolment || ["declined", "cancelled", "completed"].includes(enrolment.status)) {
    return NextResponse.json({ error: "Inscription inactive." }, { status: 404 });
  }
  if (record?.status === "present") return NextResponse.json({ error: "La présence est déjà signée." }, { status: 409 });

  const learner = one(enrolment.daily_learners as { first_name?: string | null; last_name?: string | null; email?: string | null } | { first_name?: string | null; last_name?: string | null; email?: string | null }[] | null);
  const email = text(learner?.email).toLowerCase();
  if (!email) return NextResponse.json({ error: "Aucune adresse e-mail n’est enregistrée pour cet apprenant." }, { status: 400 });

  const { data: recent } = await context.admin
    .from("daily_attendance_access_tokens")
    .select("created_at")
    .eq("organisation_id", context.organisationId)
    .eq("slot_id", slotId)
    .eq("enrolment_id", enrolmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent?.created_at && Date.now() - new Date(recent.created_at).getTime() < 60_000) {
    return NextResponse.json({ error: "Un accès vient déjà d’être généré. Patientez une minute avant une nouvelle relance." }, { status: 429 });
  }

  const { error: revokeError } = await context.admin
    .from("daily_attendance_access_tokens")
    .update({ status: "revoked" })
    .eq("organisation_id", context.organisationId)
    .eq("slot_id", slotId)
    .eq("enrolment_id", enrolmentId)
    .eq("status", "active");
  if (revokeError) return NextResponse.json({ error: revokeError.message }, { status: 500 });

  const { token, tokenHash } = createAttendanceToken();
  const expiresAt = linkExpiry(slot.slot_date);
  const { data: access, error: tokenError } = await context.admin
    .from("daily_attendance_access_tokens")
    .insert({
      organisation_id: context.organisationId,
      session_id: sessionId,
      slot_id: slotId,
      enrolment_id: enrolmentId,
      token_hash: tokenHash,
      access_type: "individual",
      channel: attendanceChannel(slot.mode, true),
      status: "active",
      expires_at: expiresAt,
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (tokenError || !access) return NextResponse.json({ error: tokenError?.message ?? "Lien impossible à créer." }, { status: 500 });

  const origin = new URL(req.url).origin;
  const attendanceUrl = `${origin}/daily-emargement/${token}`;
  const learnerName = [learner?.first_name, learner?.last_name].filter(Boolean).join(" ").trim();
  const slotLabel = `${new Date(`${slot.slot_date}T12:00:00`).toLocaleDateString("fr-FR")} · ${slot.starts_at.slice(0, 5)} à ${slot.ends_at.slice(0, 5)}${slot.label ? ` · ${slot.label}` : ""}`;
  const sent = await sendDailyAttendanceReminder({
    email,
    learnerName,
    formationTitle: formationTitle(session.daily_formations),
    slotLabel,
    attendanceUrl,
  });

  if (!sent.sent) {
    await context.admin.from("daily_attendance_access_tokens").update({ status: "revoked" }).eq("id", access.id);
    return NextResponse.json({ error: "La relance n’a pas pu être envoyée. Aucun lien actif supplémentaire n’a été conservé." }, { status: 503 });
  }

  const sentAt = new Date().toISOString();
  const { error: evidenceError } = await context.admin
    .from("daily_communications")
    .insert({
      organisation_id: context.organisationId,
      session_id: sessionId,
      enrolment_id: enrolmentId,
      communication_type: "attendance_reminder",
      channel: "email",
      recipient_email: email,
      recipient_name: learnerName || null,
      subject: sent.message.subject,
      text_body: sent.message.text,
      html_body: sent.message.html,
      provider: "resend",
      provider_message_id: sent.message.providerMessageId,
      status: "sent",
      sent_at: sentAt,
      created_by: context.user.id,
      metadata: {
        attendance_slot_id: slotId,
        attendance_access_token_id: access.id,
        token_expires_at: expiresAt,
      },
    });

  if (evidenceError) {
    console.error("Daily : relance envoyée mais preuve de communication non enregistrée", evidenceError);
  }

  return NextResponse.json({
    ok: true,
    sentTo: email,
    expiresAt,
    evidenceRecorded: !evidenceError,
  });
}
