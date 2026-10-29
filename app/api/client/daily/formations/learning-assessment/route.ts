import { NextResponse } from "next/server";

import { blockedAgentAssistanceResponse, getAssistanceTokenFromRequest } from "@/lib/server/agentAssistance";
import { getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

const MODES = new Set(["external", "selen_quiz"]);
const QUESTION_TYPES = new Set(["single_choice", "multiple_choice", "free_text"]);

type Question = {
  id: string;
  label: string;
  type: string;
  options: string[];
  correct_answers: string[];
  points: number;
  required: boolean;
  order: number;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function cleanQuestions(value: unknown): Question[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, index) => {
      const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const type = text(row.type);
      const options = Array.isArray(row.options)
        ? [...new Set(row.options.map(text).filter(Boolean))]
        : [];
      const correctAnswers = Array.isArray(row.correct_answers)
        ? [...new Set(row.correct_answers.map(text).filter((answer) => options.includes(answer)))]
        : [];
      const pointsValue = Number(row.points);
      return {
        id: text(row.id) || crypto.randomUUID(),
        label: text(row.label),
        type,
        options: ["single_choice", "multiple_choice"].includes(type) ? options : [],
        correct_answers: ["single_choice", "multiple_choice"].includes(type) ? correctAnswers : [],
        points: Number.isFinite(pointsValue) && pointsValue > 0 ? pointsValue : 1,
        required: row.required !== false,
        order: index + 1,
      };
    })
    .filter((question) => question.label && QUESTION_TYPES.has(question.type));
}

function validateQuestions(questions: Question[]) {
  for (const question of questions) {
    if (["single_choice", "multiple_choice"].includes(question.type)) {
      if (question.options.length < 2) return "Chaque question à choix doit proposer au moins deux réponses.";
      if (question.correct_answers.length === 0) return "Indiquez au moins une bonne réponse pour chaque question à choix.";
      if (question.type === "single_choice" && question.correct_answers.length !== 1) {
        return "Une question à choix unique doit avoir exactement une bonne réponse.";
      }
    }
  }
  return null;
}

export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["trainings", "sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const { data, error } = await context.admin
    .from("daily_formations")
    .select("id,title,status,version,learning_assessment_mode,learning_assessment_instructions,learning_assessment_questions,updated_at")
    .eq("organisation_id", context.organisationId)
    .neq("status", "archived")
    .order("title", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ formations: data ?? [] });
}

export async function PATCH(req: Request) {
  if (getAssistanceTokenFromRequest(req)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationContext(req, "trainings");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = text(body.id);
  const mode = MODES.has(text(body.mode)) ? text(body.mode) : "external";
  const instructions = text(body.instructions) || null;
  const questions = cleanQuestions(body.questions);

  if (!id) return NextResponse.json({ error: "Formation requise." }, { status: 400 });
  if (mode === "selen_quiz") {
    if (questions.length === 0) {
      return NextResponse.json({ error: "Ajoutez au moins une question ou choisissez une évaluation externe." }, { status: 400 });
    }
    const validationError = validateQuestions(questions);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: existing, error: readError } = await context.admin
    .from("daily_formations")
    .select("*")
    .eq("id", id)
    .eq("organisation_id", context.organisationId)
    .neq("status", "archived")
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });

  const archivedAt = new Date().toISOString();
  const nextStatus = existing.status === "validated" ? "review" : existing.status;
  const {
    id: _id,
    created_at: _createdAt,
    updated_at: _updatedAt,
    archived_at: _archivedAt,
    validation_note: _validationNote,
    previous_version_id: _previousVersionId,
    ...copy
  } = existing;

  const { data: created, error: insertError } = await context.admin
    .from("daily_formations")
    .insert({
      ...copy,
      user_id: context.user.id,
      organisation_id: context.organisationId,
      learning_assessment_mode: mode,
      learning_assessment_instructions: instructions,
      learning_assessment_questions: mode === "selen_quiz" ? questions : [],
      status: nextStatus,
      version: Number(existing.version ?? 1) + 1,
      previous_version_id: existing.id,
      validation_note: null,
      archived_at: null,
      updated_visible_at: new Date().toISOString().slice(0, 10),
    })
    .select("id,title,status,version,learning_assessment_mode,learning_assessment_instructions,learning_assessment_questions,updated_at")
    .single();

  if (insertError || !created) {
    return NextResponse.json({ error: insertError?.message ?? "Enregistrement impossible." }, { status: 500 });
  }

  const { error: archiveError } = await context.admin
    .from("daily_formations")
    .update({ status: "archived", archived_at: archivedAt })
    .eq("id", existing.id)
    .eq("organisation_id", context.organisationId);

  if (archiveError) {
    await context.admin
      .from("daily_formations")
      .update({ status: "archived", archived_at: archivedAt })
      .eq("id", created.id)
      .eq("organisation_id", context.organisationId);
    return NextResponse.json(
      { error: "La nouvelle version a été conservée mais n’a pas pu remplacer proprement l’ancienne. Aucun programme n’a été écrasé." },
      { status: 500 },
    );
  }

  return NextResponse.json({ formation: created, versioned: true });
}
