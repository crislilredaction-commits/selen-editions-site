import { NextResponse } from "next/server";

import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { logAgentAssistanceAction } from "@/lib/server/agentAssistance";

const MODES = new Set(["external", "selen_quiz"]);
const QUESTION_TYPES = new Set(["single_choice", "multiple_choice", "free_text"]);

function cleanQuestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const type = String(row.type ?? "single_choice").trim();
    const options = Array.isArray(row.options) ? [...new Set(row.options.map((item) => String(item ?? "").trim()).filter(Boolean))] : [];
    const correctAnswers = Array.isArray(row.correct_answers) ? [...new Set(row.correct_answers.map((item) => String(item ?? "").trim()).filter(Boolean))] : [];
    const validCorrectAnswers = correctAnswers.filter((answer) => options.includes(answer));
    return {
      id: String(row.id ?? `assessment_${index + 1}`).trim() || `assessment_${index + 1}`,
      label: String(row.label ?? "").trim(),
      type: QUESTION_TYPES.has(type) ? type : "single_choice",
      options: type === "free_text" ? [] : options,
      correct_answers: type === "free_text" ? [] : type === "single_choice" ? validCorrectAnswers.slice(0, 1) : validCorrectAnswers,
      points: Math.max(0.5, Number(row.points) || 1),
      required: row.required !== false,
      order: index + 1,
    };
  }).filter((question) => question.label);
}

export async function PATCH(request: Request) {
  const context = await getDailyOrganisationContext(request, "trainings", { allowAssistanceWrite: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = String(body.id ?? "").trim();
  const mode = String(body.mode ?? "external").trim();
  const instructions = String(body.instructions ?? "").trim();
  const questions = cleanQuestions(body.questions);

  if (!id) return NextResponse.json({ error: "Formation requise." }, { status: 400 });
  if (!MODES.has(mode)) return NextResponse.json({ error: "Mode d’évaluation invalide." }, { status: 400 });
  if (mode === "selen_quiz" && questions.length === 0) {
    return NextResponse.json({ error: "Ajoutez au moins une question pour l’évaluation finale ou choisissez le scan après session." }, { status: 400 });
  }
  if (mode === "selen_quiz") {
    const invalid = questions.some((question) => question.type !== "free_text" && (question.options.length < 2 || question.correct_answers.length === 0));
    if (invalid) return NextResponse.json({ error: "Chaque question à choix doit comporter au moins deux réponses distinctes et une bonne réponse." }, { status: 400 });
  }

  const { data, error } = await context.admin
    .from("daily_formations")
    .update({
      learning_assessment_mode: mode,
      learning_assessment_instructions: mode === "selen_quiz" ? instructions || null : null,
      learning_assessment_questions: mode === "selen_quiz" ? questions : [],
    })
    .eq("id", id)
    .eq("organisation_id", context.organisationId)
    .neq("status", "archived")
    .select("id,learning_assessment_mode,learning_assessment_instructions,learning_assessment_questions")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (context.assisted && context.assistance) await logAgentAssistanceAction({ supabase: context.admin, req: request, assistance: context.assistance, action: "daily_formation_assessment_update", actionLabel: "Évaluation de formation modifiée par Studio pour le client", newState: { formation_id: data.id, learning_assessment_mode: data.learning_assessment_mode } });
  return NextResponse.json({ formation: data, assistanceMode: context.assisted });
}
