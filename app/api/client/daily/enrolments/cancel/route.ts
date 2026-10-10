import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const CLOSED = new Set(["cancelled", "declined", "abandoned", "completed"]);

/** Désinscription individuelle avant formation, sans effacer l'historique. */
export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions", { allowAssistanceWrite: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => null);
  const enrolmentId = text(body?.enrolment_id);
  const reason = text(body?.reason);
  const occurredAt = text(body?.occurred_at);
  const date = new Date(occurredAt);
  if (!enrolmentId || !reason || !occurredAt || !Number.isFinite(date.getTime()))
    return NextResponse.json({ error: "Inscription, motif et date de désinscription sont requis." }, { status: 400 });
  const admin = context.admin;
  const { data: enrolment, error: readError } = await admin.from("daily_session_enrolments")
    .select("id,learner_id,session_id,status").eq("id", enrolmentId)
    .eq("organisation_id", context.organisationId).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!enrolment) return NextResponse.json({ error: "Inscription introuvable." }, { status: 404 });
  if (CLOSED.has(enrolment.status)) return NextResponse.json({ error: "Cette inscription est déjà clôturée." }, { status: 409 });
  const { data: session, error: sessionError } = await admin.from("daily_sessions")
    .select("start_date").eq("id", enrolment.session_id).eq("organisation_id", context.organisationId).maybeSingle();
  if (sessionError || !session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
  if (session.start_date && Date.now() >= new Date(session.start_date).getTime())
    return NextResponse.json({ error: "La session a commencé : utilisez la procédure d'abandon avec conservation des preuves." }, { status: 409 });
  const { data: updated, error: updateError } = await admin.from("daily_session_enrolments")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", enrolmentId).eq("organisation_id", context.organisationId).eq("status", enrolment.status)
    .select("id").maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "L'inscription a changé entre-temps. Actualisez la page." }, { status: 409 });
  const { error: historyError } = await admin.from("daily_session_followup_entries").insert({
    organisation_id: context.organisationId, session_id: enrolment.session_id,
    enrolment_id: enrolmentId, entry_type: "incident", level: "info",
    occurred_at: date.toISOString(), summary: "Désinscription avant formation",
    description: reason, status: "resolved", resolved_at: new Date().toISOString(),
    author_role: "Organisme de formation", author_name: "Organisme de formation",
  });
  if (historyError) return NextResponse.json({ error: "Inscription annulée, mais journalisation à vérifier : " + historyError.message, enrolmentId }, { status: 500 });
  const [portal, attendance] = await Promise.all([
    admin.from("daily_portal_access_tokens").update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("session_id", enrolment.session_id).eq("portal_type", "learner")
      .eq("entity_key", `learner:${enrolment.learner_id}`).neq("status", "revoked"),
    admin.from("daily_attendance_access_tokens").update({ status: "revoked" })
      .eq("organisation_id", context.organisationId).eq("session_id", enrolment.session_id)
      .eq("enrolment_id", enrolmentId).eq("status", "active"),
  ]);
  if (portal.error || attendance.error) return NextResponse.json({ error: "Désinscription enregistrée, mais révocation des accès à vérifier.", enrolmentId }, { status: 500 });
  return NextResponse.json({ ok: true, enrolmentId, status: "cancelled" });
}
