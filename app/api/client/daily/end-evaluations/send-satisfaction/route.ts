import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { activeDailyEnrolment, createDailyFeedbackToken, dailyFeedbackPath } from "@/lib/server/dailyEndEvaluations";
import { sendDailySatisfactionRequest } from "@/lib/server/dailyEndEvaluationEmails";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function POST(request: Request) {
  const context = await getDailyOrganisationContext(request, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.assisted) {
    return NextResponse.json({ error: "L’assistance agent est en lecture seule." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const sessionId = text(body.session_id);
  const enrolmentId = text(body.enrolment_id);
  if (!sessionId || !enrolmentId) {
    return NextResponse.json({ error: "Session et inscription requises." }, { status: 400 });
  }

  const [{ data: session, error: sessionError }, { data: enrolment, error: enrolmentError }] = await Promise.all([
    context.admin
      .from("daily_sessions")
      .select("id,end_date,status,daily_formations(title)")
      .eq("id", sessionId)
      .eq("organisation_id", context.organisationId)
      .maybeSingle(),
    context.admin
      .from("daily_session_enrolments")
      .select("id,session_id,status,daily_learners(first_name,last_name,email)")
      .eq("id", enrolmentId)
      .eq("session_id", sessionId)
      .eq("organisation_id", context.organisationId)
      .maybeSingle(),
  ]);

  if (sessionError || enrolmentError) {
    return NextResponse.json({ error: sessionError?.message ?? enrolmentError?.message ?? "Lecture impossible." }, { status: 500 });
  }
  if (!session || session.status === "archived") {
    return NextResponse.json({ error: "Session introuvable ou archivée." }, { status: 404 });
  }
  if (!enrolment || !activeDailyEnrolment(enrolment.status)) {
    return NextResponse.json({ error: "Inscription introuvable ou inactive." }, { status: 404 });
  }

  const { data: existingFeedback, error: feedbackError } = await context.admin
    .from("daily_learner_feedback_responses")
    .select("id")
    .eq("organisation_id", context.organisationId)
    .eq("session_id", sessionId)
    .eq("enrolment_id", enrolmentId)
    .maybeSingle();
  if (feedbackError) return NextResponse.json({ error: feedbackError.message }, { status: 500 });
  if (existingFeedback) {
    return NextResponse.json({ error: "Le questionnaire de satisfaction a déjà été complété." }, { status: 409 });
  }

  const learner = one(enrolment.daily_learners as { first_name?: string | null; last_name?: string | null; email?: string | null } | { first_name?: string | null; last_name?: string | null; email?: string | null }[] | null);
  const email = text(learner?.email).toLowerCase();
  const learnerName = [learner?.first_name, learner?.last_name].map(text).filter(Boolean).join(" ");
  if (!email) {
    return NextResponse.json({ error: "Aucune adresse e-mail n’est enregistrée pour cet apprenant." }, { status: 400 });
  }

  const formation = one(session.daily_formations as { title?: string | null } | { title?: string | null }[] | null);
  const formationTitle = text(formation?.title) || "votre formation";

  const { error: revokeError } = await context.admin
    .from("daily_learner_feedback_tokens")
    .update({ status: "revoked" })
    .eq("organisation_id", context.organisationId)
    .eq("session_id", sessionId)
    .eq("enrolment_id", enrolmentId)
    .eq("status", "active");
  if (revokeError) return NextResponse.json({ error: revokeError.message }, { status: 500 });

  const { token, tokenHash } = createDailyFeedbackToken();
  const expiryBase = session.end_date ? new Date(`${session.end_date}T12:00:00.000Z`) : new Date();
  expiryBase.setUTCDate(expiryBase.getUTCDate() + 30);
  const expiresAt = expiryBase.toISOString();
  const { data: tokenRow, error: tokenError } = await context.admin
    .from("daily_learner_feedback_tokens")
    .insert({
      organisation_id: context.organisationId,
      session_id: sessionId,
      enrolment_id: enrolmentId,
      token_hash: tokenHash,
      status: "active",
      expires_at: expiresAt,
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (tokenError || !tokenRow) {
    return NextResponse.json({ error: tokenError?.message ?? "Lien de satisfaction impossible à créer." }, { status: 500 });
  }

  const feedbackUrl = new URL(dailyFeedbackPath(token), request.url).toString();
  const sent = await sendDailySatisfactionRequest({
    email,
    learnerName,
    formationTitle,
    feedbackUrl,
    expiresAt,
  });

  if (!sent.sent) {
    await context.admin
      .from("daily_learner_feedback_tokens")
      .update({ status: "revoked" })
      .eq("id", tokenRow.id)
      .eq("organisation_id", context.organisationId);
    return NextResponse.json({ error: "La demande de satisfaction n’a pas pu être envoyée. Le lien créé a été révoqué." }, { status: 503 });
  }

  const sentAt = new Date().toISOString();
  const { error: evidenceError } = await context.admin.from("daily_communications").insert({
    organisation_id: context.organisationId,
    session_id: sessionId,
    enrolment_id: enrolmentId,
    communication_type: "satisfaction_request",
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
      feedback_token_id: tokenRow.id,
      expires_at: expiresAt,
    },
  });

  if (evidenceError) {
    console.error("Daily : satisfaction envoyée mais preuve de communication non enregistrée", evidenceError);
  }

  return NextResponse.json({
    ok: true,
    sentTo: email,
    sentAt,
    expiresAt,
    evidenceRecorded: !evidenceError,
  });
}
