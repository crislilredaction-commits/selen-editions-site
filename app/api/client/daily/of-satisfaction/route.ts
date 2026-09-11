import { NextResponse } from "next/server";
import { getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

function clean(value: unknown) { return String(value ?? "").trim(); }
function rating(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}
function optionalText(value: unknown, max = 4000) {
  const text = clean(value);
  return text ? text.slice(0, max) : null;
}
function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function GET(request: Request) {
  const context = await getDailyOrganisationReadContext(request, ["sessions", "trainings"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const { admin, organisationId } = context;
  const { data: dossiers, error: dossierError } = await admin
    .from("daily_session_dossiers")
    .select("session_id")
    .eq("organisation_id", organisationId)
    .eq("status", "completed");
  if (dossierError) return NextResponse.json({ error: dossierError.message }, { status: 500 });

  const sessionIds = [...new Set((dossiers ?? []).map((row) => row.session_id).filter(Boolean))];
  if (!sessionIds.length) return NextResponse.json({ sessions: [] });

  const [sessionsResult, responsesResult] = await Promise.all([
    admin.from("daily_sessions")
      .select("id,internal_reference,start_date,end_date,daily_formations(title)")
      .eq("organisation_id", organisationId)
      .in("id", sessionIds)
      .order("end_date", { ascending: false }),
    admin.from("daily_stakeholder_satisfaction_responses")
      .select("id,session_id,overall_rating,strengths,improvements,free_comment,submitted_at")
      .eq("organisation_id", organisationId)
      .eq("stakeholder_type", "client")
      .eq("entity_key", organisationId)
      .in("session_id", sessionIds),
  ]);
  const error = sessionsResult.error ?? responsesResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const responseBySession = new Map((responsesResult.data ?? []).map((row) => [row.session_id, row]));

  return NextResponse.json({
    sessions: (sessionsResult.data ?? []).map((session) => ({
      id: session.id,
      reference: session.internal_reference,
      startDate: session.start_date,
      endDate: session.end_date,
      formationTitle: one(session.daily_formations)?.title ?? "Formation Daily",
      response: responseBySession.get(session.id) ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const context = await getDailyOrganisationContext(request, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.assisted) return NextResponse.json({ error: "La satisfaction OF doit être transmise par l’organisme de formation." }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Réponse invalide." }, { status: 400 });
  const sessionId = clean(body.session_id);
  const overallRating = rating(body.overall_rating);
  if (!sessionId || overallRating === null) return NextResponse.json({ error: "La session et une note de 1 à 5 sont obligatoires." }, { status: 400 });

  const { admin, organisationId, user } = context;
  const [{ data: session, error: sessionError }, { data: dossier, error: dossierError }] = await Promise.all([
    admin.from("daily_sessions").select("id,internal_reference,daily_formations(title)").eq("id", sessionId).eq("organisation_id", organisationId).maybeSingle(),
    admin.from("daily_session_dossiers").select("id,status").eq("session_id", sessionId).eq("organisation_id", organisationId).eq("status", "completed").maybeSingle(),
  ]);
  const readError = sessionError ?? dossierError;
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!session || !dossier) return NextResponse.json({ error: "La satisfaction OF n’est disponible qu’après clôture du dossier de session." }, { status: 409 });

  const { data: existing, error: existingError } = await admin.from("daily_stakeholder_satisfaction_responses")
    .select("id").eq("session_id", sessionId).eq("stakeholder_type", "client").eq("entity_key", organisationId).maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing) return NextResponse.json({ error: "Votre retour a déjà été transmis pour cette session." }, { status: 409 });

  const strengths = optionalText(body.strengths);
  const improvements = optionalText(body.improvements);
  const freeComment = optionalText(body.free_comment);
  const { data: inserted, error: insertError } = await admin.from("daily_stakeholder_satisfaction_responses").insert({
    organisation_id: organisationId,
    session_id: sessionId,
    stakeholder_type: "client",
    entity_key: organisationId,
    entity_email: clean(user.email).toLowerCase() || null,
    overall_rating: overallRating,
    strengths,
    improvements,
    free_comment: freeComment,
  }).select("id,submitted_at").single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const formationTitle = one(session.daily_formations)?.title ?? "Formation Daily";
  const noteParts = [
    `Note plateforme : ${overallRating}/5.`,
    strengths ? `Apprécié : ${strengths}` : null,
    improvements ? `À améliorer : ${improvements}` : null,
    freeComment ? `Suggestions : ${freeComment}` : null,
  ].filter(Boolean).join("\n");
  const { error: followupError } = await admin.from("daily_session_followup_entries").insert({
    organisation_id: organisationId,
    session_id: sessionId,
    author_user_id: user.id,
    entry_type: "client_satisfaction",
    title: `Retour OF sur Selen Daily — ${formationTitle}`,
    note: noteParts,
    followup_status: "closed",
    metadata: { satisfaction_response_id: inserted.id, overall_rating: overallRating, source: "of_platform_satisfaction" },
  });
  if (followupError) return NextResponse.json({ ok: true, response: inserted, warning: "Réponse enregistrée, mais la trace de suivi n’a pas pu être ajoutée." }, { status: 207 });

  return NextResponse.json({ ok: true, response: inserted }, { status: 201 });
}
