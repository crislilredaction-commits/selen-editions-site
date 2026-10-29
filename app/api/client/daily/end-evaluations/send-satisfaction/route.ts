import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { activeDailyEnrolment, createDailyFeedbackToken, dailyFeedbackPath } from "@/lib/server/dailyEndEvaluations";
import { prepareDailySatisfactionRequestEmail, sendDailySatisfactionRequest } from "@/lib/server/dailyEndEvaluationEmails";

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
  const emailInput = { email, learnerName, formationTitle, feedbackUrl, expiresAt };
  const prepared = prepareDailySatisfactionRequestEmail(emailInput);

  const { data: communication, error: evidenceError } = await context.admin
    .from("daily_communications")
    .insert({
      organisation_id: context.organisationId,
      session_id: sessionId,
      enrolment_id: enrolmentId,
      communication_type: "satisfaction_request",
      channel: "email",
      recipient_email: email,
      recipient_name: learnerName || null,
      subject: prepared.subject,
      text_body: prepared.text,
      html_body: prepared.html,
      provider: "resend",
      status: "queued",
      created_by: context.user.id,
      metadata: {
        feedback_token_id: tokenRow.id,
        expires_at: expiresAt,
      },
    })
    .select("id")
    .single();

  if (evidenceError || !communication) {
    await context.admin
      .from("daily_learner_feedback_tokens")
      .update({ status: "revoked" })
      .eq("id", tokenRow.id)
      .eq("organisation_id", context.organisationId);
    return NextResponse.json({ error: "La preuve d’envoi n’a pas pu être réservée. Le message n’a pas été envoyé et le lien a été révoqué." }, { status: 500 });
  }

  const sent = await sendDailySatisfactionRequest(emailInput);
  if (!sent.sent) {
    const failedAt = new Date().toISOString();
    await Promise.all([
      context.admin
        .from("daily_learner_feedback_tokens")
        .update({ status: "revoked" })
        .eq("id", tokenRow.id)
        .eq("organisation_id", context.organisationId),
      context.admin
        .from("daily_communications")
        .update({ status: "failed", failed_at: failedAt, failure_reason: sent.reason })
        .eq("id", communication.id)
        .eq("organisation_id", context.organisationId),
    ]);
    return NextResponse.json({ error: "La demande de satisfaction n’a pas pu être envoyée. Le lien a été révoqué et la tentative est conservée." }, { status: 503 });
  }

  const sentAt = new Date().toISOString();
  const { error: finalizeError } = await context.admin
    .from("daily_communications")
    .update({
      provider_message_id: sent.message.providerMessageId,
      status: "sent",
      sent_at: sentAt,
      failed_at: null,
      failure_reason: null,
    })
    .eq("id", communication.id)
    .eq("organisation_id", context.organisationId);

  if (finalizeError) {
    console.error("Daily : satisfaction envoyée mais finalisation de la preuve impossible", finalizeError);
  }

  return NextResponse.json({
    ok: true,
    sentTo: email,
    sentAt,
    expiresAt,
    evidenceRecorded: !finalizeError,
    communicationId: communication.id,
  });
}
