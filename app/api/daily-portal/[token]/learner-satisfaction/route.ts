import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getLearnerSatisfactionAvailability } from "@/lib/daily/endOfTraining";

type Params = { params: Promise<{ token: string }> };
type JsonRecord = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedEmail(value: unknown) {
  return text(value).toLowerCase();
}

function rating(value: unknown, required = false) {
  if (value == null || value === "") return required ? null : undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

function optionalText(value: unknown) {
  const clean = text(value);
  return clean ? clean.slice(0, 4000) : null;
}

function enrolmentLearner(enrolment: { daily_learners?: unknown }) {
  const raw = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
  return raw && typeof raw === "object" ? raw as JsonRecord : null;
}

function learnerDisplayName(enrolment: { daily_learners?: unknown }) {
  const learner = enrolmentLearner(enrolment);
  return [text(learner?.first_name), text(learner?.last_name)].filter(Boolean).join(" ")
    || text(learner?.email)
    || "Apprenant";
}

async function resolveLearner(token: string) {
  const supabase = getAdminSupabase();
  const { data: access, error: accessError } = await supabase
    .from("daily_portal_access_tokens")
    .select("id,status,expires_at,portal_type,entity_email,session_id")
    .eq("token", token)
    .maybeSingle();
  if (accessError) throw accessError;
  if (!access) return { error: "Portail introuvable.", status: 404 } as const;
  if (access.portal_type !== "learner") return { error: "Questionnaire réservé à l’apprenant.", status: 403 } as const;
  if (["revoked", "expired"].includes(String(access.status ?? ""))) return { error: "Cet accès n’est plus actif.", status: 403 } as const;
  if (access.expires_at && new Date(access.expires_at).getTime() < Date.now()) return { error: "Ce lien de portail a expiré.", status: 410 } as const;

  const { data: session, error: sessionError } = await supabase
    .from("daily_sessions")
    .select("id,organisation_id,formation_id,end_date,status,daily_formations(id,title,learning_assessment_mode)")
    .eq("id", access.session_id)
    .neq("status", "archived")
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) return { error: "Session introuvable.", status: 404 } as const;

  const { data: enrolments, error: enrolmentError } = await supabase
    .from("daily_session_enrolments")
    .select("id,status,daily_learners(id,email,first_name,last_name)")
    .eq("session_id", session.id)
    .eq("organisation_id", session.organisation_id)
    .not("status", "in", "(declined,cancelled,abandoned)");
  if (enrolmentError) throw enrolmentError;
  const email = normalizedEmail(access.entity_email);
  const enrolment = (enrolments ?? []).find((row) => {
    const learner = Array.isArray(row.daily_learners) ? row.daily_learners[0] : row.daily_learners;
    return normalizedEmail(learner && typeof learner === "object" ? (learner as JsonRecord).email : "") === email;
  });
  if (!enrolment) return { error: "Inscription apprenant introuvable.", status: 404 } as const;

  const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
  if (!formation || typeof formation !== "object") return { error: "Formation introuvable.", status: 404 } as const;

  const [{ data: assessment, error: assessmentError }, { data: feedback, error: feedbackError }, { data: finalSlot, error: slotError }] = await Promise.all([
    supabase.from("daily_learning_assessment_responses").select("id,submitted_at").eq("session_id", session.id).eq("enrolment_id", enrolment.id).maybeSingle(),
    supabase.from("daily_learner_feedback_responses").select("id,submitted_at").eq("session_id", session.id).eq("enrolment_id", enrolment.id).maybeSingle(),
    supabase.from("daily_attendance_slots").select("slot_date,ends_at").eq("session_id", session.id).order("slot_date", { ascending: false }).order("ends_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const stateError = assessmentError ?? feedbackError ?? slotError;
  if (stateError) throw stateError;

  const mode = text((formation as JsonRecord).learning_assessment_mode);
  const availability = getLearnerSatisfactionAvailability({
    mode,
    assessmentSubmitted: Boolean(assessment),
    endDate: session.end_date,
    finalSlot,
  });

  return { supabase, session, enrolment, formation: formation as JsonRecord, assessment, feedback, mode, availability } as const;
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const clean = text(token);
  if (!clean) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  try {
    const resolved = await resolveLearner(clean);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    return NextResponse.json({
      portalType: "learner",
      available: resolved.availability.available,
      availableFrom: resolved.availability.availableFrom,
      availabilityReason: resolved.availability.reason,
      alreadySubmitted: Boolean(resolved.feedback),
      response: resolved.feedback,
      assessmentSubmitted: Boolean(resolved.assessment),
      mode: resolved.mode,
      session: {
        endDate: resolved.session.end_date,
        formationTitle: text(resolved.formation.title),
      },
    });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Questionnaire indisponible." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const clean = text(token);
  if (!clean) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  try {
    const resolved = await resolveLearner(clean);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    if (resolved.feedback) return NextResponse.json({ error: "Votre questionnaire a déjà été transmis." }, { status: 409 });
    if (!resolved.availability.available) {
      return NextResponse.json({ error: resolved.mode === "selen_quiz" ? "Transmettez d’abord votre évaluation de fin de formation." : "Le questionnaire n’est pas encore ouvert." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as JsonRecord;
    const overall = rating(body.overall_rating, true);
    const objectives = rating(body.objectives_rating, true);
    const trainer = rating(body.trainer_rating);
    const organisation = rating(body.organisation_rating);
    const content = rating(body.content_rating);
    const pace = rating(body.pace_rating);
    if (overall == null || objectives == null || trainer === null || organisation === null || content === null || pace === null) {
      return NextResponse.json({ error: "Les notes doivent être comprises entre 1 et 5. La satisfaction globale et l’atteinte des objectifs sont obligatoires." }, { status: 400 });
    }

    const strengths = optionalText(body.strengths);
    const improvements = optionalText(body.improvements);
    const adaptationFeedback = optionalText(body.adaptation_feedback);
    const freeComment = optionalText(body.free_comment);
    const { data: created, error: insertError } = await resolved.supabase
      .from("daily_learner_feedback_responses")
      .insert({
        organisation_id: resolved.session.organisation_id,
        session_id: resolved.session.id,
        enrolment_id: resolved.enrolment.id,
        overall_rating: overall,
        objectives_rating: objectives,
        trainer_rating: trainer ?? null,
        organisation_rating: organisation ?? null,
        content_rating: content ?? null,
        pace_rating: pace ?? null,
        would_recommend: typeof body.would_recommend === "boolean" ? body.would_recommend : null,
        strengths,
        improvements,
        adaptation_feedback: adaptationFeedback,
        free_comment: freeComment,
      })
      .select("id,submitted_at")
      .single();
    if (insertError || !created) {
      if (insertError?.code === "23505") return NextResponse.json({ error: "Votre questionnaire a déjà été transmis." }, { status: 409 });
      return NextResponse.json({ error: insertError?.message ?? "Enregistrement impossible." }, { status: 500 });
    }

    const hasUsefulComment = Boolean(strengths || improvements || adaptationFeedback || freeComment);
    const needsAttention = overall <= 3 || objectives <= 3 || Boolean(improvements || adaptationFeedback || freeComment);
    if (hasUsefulComment || needsAttention) {
      const authorName = learnerDisplayName(resolved.enrolment);
      const description = [
        `Satisfaction globale : ${overall}/5.`,
        `Atteinte des objectifs : ${objectives}/5.`,
        strengths ? `Points positifs : ${strengths}` : null,
        improvements ? `À améliorer : ${improvements}` : null,
        adaptationFeedback ? `Adaptations / besoins : ${adaptationFeedback}` : null,
        freeComment ? `Commentaire : ${freeComment}` : null,
      ].filter(Boolean).join("\n");
      const { error: followupError } = await resolved.supabase
        .from("daily_session_followup_entries")
        .insert({
          organisation_id: resolved.session.organisation_id,
          session_id: resolved.session.id,
          enrolment_id: resolved.enrolment.id,
          entry_type: "note",
          level: needsAttention ? "attention" : "info",
          occurred_at: created.submitted_at,
          summary: `Satisfaction apprenant — ${authorName}`.slice(0, 240),
          description,
          status: needsAttention ? "open" : "resolved",
          resolved_at: needsAttention ? null : created.submitted_at,
          author_role: "Apprenant",
          author_name: authorName,
        });
      if (followupError) {
        return NextResponse.json({
          submitted: true,
          submittedAt: created.submitted_at,
          warning: "Questionnaire enregistré, mais le commentaire n’a pas pu être ajouté au suivi de session.",
        }, { status: 207 });
      }
    }

    return NextResponse.json({ submitted: true, submittedAt: created.submitted_at });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Enregistrement impossible." }, { status: 500 });
  }
}
