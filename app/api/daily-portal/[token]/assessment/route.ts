import { NextResponse } from "next/server";
import { isActivePortalAttendanceToken } from "@/lib/daily/portalAttendanceAccess.mjs";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { findUniqueDailyLearnerPortalEnrolment } from "@/lib/server/dailyPortalLearnerIdentity";

type Params = { params: Promise<{ token: string }> };
type JsonRecord = Record<string, unknown>;

type AssessmentQuestion = {
  id: string;
  label: string;
  type: "single_choice" | "multiple_choice" | "free_text";
  options: string[];
  correct_answers: string[];
  points: number;
  required: boolean;
  order: number;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function asQuestion(value: unknown, index: number): AssessmentQuestion | null {
  if (!value || typeof value !== "object") return null;
  const row = value as JsonRecord;
  const type = text(row.type);
  if (!["single_choice", "multiple_choice", "free_text"].includes(type)) return null;
  const options = Array.isArray(row.options) ? row.options.map(text).filter(Boolean) : [];
  const correctAnswers = Array.isArray(row.correct_answers) ? row.correct_answers.map(text).filter(Boolean) : [];
  return {
    id: text(row.id) || `q_${index + 1}`,
    label: text(row.label),
    type: type as AssessmentQuestion["type"],
    options,
    correct_answers: correctAnswers,
    points: Number.isFinite(Number(row.points)) && Number(row.points) > 0 ? Number(row.points) : 1,
    required: row.required !== false,
    order: Number.isFinite(Number(row.order)) ? Number(row.order) : index + 1,
  };
}

function sanitizeQuestions(value: unknown) {
  if (!Array.isArray(value)) return [] as AssessmentQuestion[];
  return value.map(asQuestion).filter((question): question is AssessmentQuestion => Boolean(question?.label));
}

function publicQuestions(questions: AssessmentQuestion[]) {
  return questions.map(({ correct_answers: _correctAnswers, ...question }) => question);
}

function dateInParis(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function normalizeAnswer(value: unknown) {
  if (Array.isArray(value)) return [...new Set(value.map(text).filter(Boolean))];
  return text(value);
}

function equalSets(left: string[], right: string[]) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function resolveLearner(token: string) {
  const supabase = getAdminSupabase();
  const { data: access, error: accessError } = await supabase
    .from("daily_portal_access_tokens")
    .select("id,token,status,expires_at,portal_type,entity_key,entity_email,session_id")
    .eq("token", token)
    .maybeSingle();
  if (accessError) throw accessError;
  if (!access) return { error: "Portail introuvable.", status: 404 } as const;
  if (access.portal_type !== "learner") return { error: "Évaluation réservée à l’apprenant.", status: 403 } as const;
  if (!["pending", "viewed"].includes(String(access.status ?? ""))) return { error: "Cet accès n’est plus actif.", status: 403 } as const;
  if (!isActivePortalAttendanceToken(access.status, access.expires_at)) {
    return { error: "Ce lien de portail a expiré.", status: 410 } as const;
  }

  const { data: session, error: sessionError } = await supabase
    .from("daily_sessions")
    .select("id,organisation_id,formation_id,start_date,end_date,status,daily_formations(id,title,learning_assessment_mode,learning_assessment_instructions,learning_assessment_questions)")
    .eq("id", access.session_id)
    .neq("status", "archived")
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) return { error: "Session introuvable.", status: 404 } as const;

  const { data: enrolments, error: enrolmentError } = await supabase
    .from("daily_session_enrolments")
    .select("id,learner_id,status,daily_learners(id,email,first_name,last_name)")
    .eq("session_id", session.id)
    .eq("organisation_id", session.organisation_id);
  if (enrolmentError) throw enrolmentError;

  const enrolment = findUniqueDailyLearnerPortalEnrolment(access, enrolments ?? []);
  if (!enrolment) return { error: "Identité apprenant introuvable ou ambiguë.", status: 409 } as const;
  if (["declined", "cancelled", "abandoned"].includes(String(enrolment.status ?? ""))) {
    return { error: "Cette inscription n’est plus active.", status: 403 } as const;
  }

  const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
  if (!formation || typeof formation !== "object") return { error: "Formation introuvable.", status: 404 } as const;

  const { data: response, error: responseError } = await supabase
    .from("daily_learning_assessment_responses")
    .select("id,auto_score,score_max,requires_manual_review,submitted_at")
    .eq("session_id", session.id)
    .eq("enrolment_id", enrolment.id)
    .maybeSingle();
  if (responseError) throw responseError;

  return { supabase, access, session, enrolment, formation: formation as JsonRecord, response } as const;
}

function assessmentSummaryNeedsSync(summary: JsonRecord | null, response: JsonRecord) {
  if (!summary) return true;
  // A trainer's finalized assessment is authoritative and must never be overwritten.
  if (text(summary.outcome) !== "pending") return false;
  const sameScore = (left: unknown, right: unknown) =>
    left == null && right == null || left != null && right != null && Number(left) === Number(right);
  return text(summary.method) !== "Selen quiz"
    || !sameScore(summary.score, response.auto_score)
    || !sameScore(summary.score_max, response.score_max);
}

async function assessmentSummaryState(
  supabase: ReturnType<typeof getAdminSupabase>,
  session: JsonRecord,
  enrolment: JsonRecord,
  response: JsonRecord,
  repair: boolean,
) {
  const { data: summary, error: readError } = await supabase
    .from("daily_learning_assessments")
    .select("id,outcome,method,score,score_max")
    .eq("organisation_id", session.organisation_id)
    .eq("session_id", session.id)
    .eq("enrolment_id", enrolment.id)
    .maybeSingle();
  if (readError) throw readError;
  const pending = assessmentSummaryNeedsSync(summary, response);
  if (!pending || !repair) return pending;

  const patch = {
    method: "Selen quiz",
    score: response.auto_score ?? null,
    score_max: response.score_max ?? null,
    notes: response.requires_manual_review
      ? "Questionnaire Selen transmis. Réponse(s) libre(s) à relire par le formateur."
      : "Questionnaire Selen transmis. Résultat à valider par le formateur.",
    updated_at: new Date().toISOString(),
  };
  const result = summary?.id
    ? await supabase.from("daily_learning_assessments")
      .update(patch)
      .eq("id", summary.id)
      .eq("organisation_id", session.organisation_id)
      .eq("session_id", session.id)
      .eq("enrolment_id", enrolment.id)
      .eq("outcome", "pending")
    : await supabase.from("daily_learning_assessments").insert({
      organisation_id: session.organisation_id,
      session_id: session.id,
      enrolment_id: enrolment.id,
      outcome: "pending",
      ...patch,
    });
  if (result.error) throw result.error;
  return false;
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const clean = text(token);
  if (!clean) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  try {
    const resolved = await resolveLearner(clean);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

    const mode = text(resolved.formation.learning_assessment_mode);
    const endDate = text(resolved.session.end_date);
    const available = Boolean(endDate && dateInParis() >= endDate);
    const questions = mode === "selen_quiz" ? sanitizeQuestions(resolved.formation.learning_assessment_questions) : [];
    const summaryPending = resolved.response
      ? await assessmentSummaryState(resolved.supabase, resolved.session, resolved.enrolment, resolved.response, false)
      : false;

    return NextResponse.json({
      assessment: {
        mode,
        title: text(resolved.formation.title),
        instructions: text(resolved.formation.learning_assessment_instructions),
        endDate,
        available,
        submitted: Boolean(resolved.response),
        summaryPending,
        submittedAt: resolved.response?.submitted_at ?? null,
        autoScore: resolved.response?.auto_score ?? null,
        scoreMax: resolved.response?.score_max ?? null,
        requiresManualReview: resolved.response?.requires_manual_review ?? false,
        questions: available && !resolved.response ? publicQuestions(questions) : [],
      },
    });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Évaluation indisponible." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const clean = text(token);
  if (!clean) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  try {
    const resolved = await resolveLearner(clean);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    // Retrying an already saved submission only repairs its summary; it never creates a second response.
    if (resolved.response) {
      try {
        await assessmentSummaryState(resolved.supabase, resolved.session, resolved.enrolment, resolved.response, true);
        return NextResponse.json({ submitted: true, alreadySubmitted: true, summaryPending: false,
          submittedAt: resolved.response.submitted_at, autoScore: resolved.response.auto_score,
          scoreMax: resolved.response.score_max, requiresManualReview: resolved.response.requires_manual_review });
      } catch {
        return NextResponse.json({ submitted: true, alreadySubmitted: true, summaryPending: true,
          warning: "Vos réponses sont conservées, mais leur synchronisation avec le suivi formateur reste en attente.",
          submittedAt: resolved.response.submitted_at, autoScore: resolved.response.auto_score,
          scoreMax: resolved.response.score_max, requiresManualReview: resolved.response.requires_manual_review }, { status: 202 });
      }
    }
    if (text(resolved.formation.learning_assessment_mode) !== "selen_quiz") {
      return NextResponse.json({ error: "Cette formation utilise une évaluation externe." }, { status: 409 });
    }

    const endDate = text(resolved.session.end_date);
    if (!endDate || dateInParis() < endDate) {
      return NextResponse.json({ error: "L’évaluation sera disponible le dernier jour de la formation." }, { status: 403 });
    }

    const questions = sanitizeQuestions(resolved.formation.learning_assessment_questions);
    if (questions.length === 0) return NextResponse.json({ error: "Questionnaire non configuré." }, { status: 409 });

    const body = (await request.json().catch(() => ({}))) as JsonRecord;
    const rawAnswers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
      ? body.answers as JsonRecord
      : {};
    const answers: Record<string, string | string[]> = {};
    let autoScore = 0;
    let scoreMax = 0;
    let requiresManualReview = false;

    for (const question of questions) {
      const answer = normalizeAnswer(rawAnswers[question.id]);
      const empty = Array.isArray(answer) ? answer.length === 0 : !answer;
      if (question.required && empty) {
        return NextResponse.json({ error: `Réponse requise : ${question.label}` }, { status: 400 });
      }
      answers[question.id] = answer;

      if (question.type === "free_text") {
        requiresManualReview = true;
        continue;
      }

      scoreMax += question.points;
      const selected = Array.isArray(answer) ? answer : answer ? [answer] : [];
      if (selected.some((value) => !question.options.includes(value))) {
        return NextResponse.json({ error: `Réponse invalide : ${question.label}` }, { status: 400 });
      }
      if (equalSets(selected, question.correct_answers)) autoScore += question.points;
    }

    const { data: created, error: insertError } = await resolved.supabase
      .from("daily_learning_assessment_responses")
      .insert({
        organisation_id: resolved.session.organisation_id,
        session_id: resolved.session.id,
        enrolment_id: resolved.enrolment.id,
        formation_id: resolved.session.formation_id,
        question_snapshot: questions,
        answers,
        auto_score: scoreMax > 0 ? autoScore : null,
        score_max: scoreMax > 0 ? scoreMax : null,
        requires_manual_review: requiresManualReview,
      })
      .select("id,auto_score,score_max,requires_manual_review,submitted_at")
      .single();
    if (insertError || !created) {
      if (insertError?.code === "23505") return NextResponse.json({ error: "Cette évaluation a déjà été transmise." }, { status: 409 });
      return NextResponse.json({ error: insertError?.message ?? "Transmission impossible." }, { status: 500 });
    }

    let summaryPending = false;
    try {
      await assessmentSummaryState(resolved.supabase, resolved.session, resolved.enrolment, created, true);
    } catch {
      // The immutable response is already saved: never report that the submission was lost.
      summaryPending = true;
    }

    return NextResponse.json({
      submitted: true,
      summaryPending,
      ...(summaryPending ? { warning: "Vos réponses sont conservées, mais leur synchronisation avec le suivi formateur reste en attente." } : {}),
      submittedAt: created.submitted_at,
      autoScore: created.auto_score,
      scoreMax: created.score_max,
      requiresManualReview: created.requires_manual_review,
    }, { status: summaryPending ? 202 : 200 });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Transmission impossible." }, { status: 500 });
  }
}
