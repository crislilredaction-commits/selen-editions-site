import { NextResponse } from "next/server";
import { blockedAgentAssistanceResponse, getAssistanceTokenFromRequest } from "@/lib/server/agentAssistance";
import { getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

const MODES = new Set(["off_platform", "selen"]);
const QUESTION_TYPES = new Set(["single_choice", "multiple_choice", "free_text", "scale_1_5"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value: unknown) {
  return value === true || value === "true" || value === "on";
}

function positiveNumber(value: unknown, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanQuestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const type = text(row.type);
    const options = Array.isArray(row.options)
      ? row.options.map((option) => text(option)).filter(Boolean)
      : [];
    const correctAnswers = Array.isArray(row.correct_answers)
      ? row.correct_answers.map((answer) => text(answer)).filter((answer) => options.includes(answer))
      : [];
    return {
      id: text(row.id) || `evaluation_${index + 1}`,
      label: text(row.label),
      help_text: text(row.help_text),
      required: bool(row.required),
      type,
      options: ["single_choice", "multiple_choice"].includes(type) ? options : [],
      correct_answers: ["single_choice", "multiple_choice"].includes(type) ? correctAnswers : [],
      points: positiveNumber(row.points),
      order: index + 1,
    };
  }).filter((question) => question.label && QUESTION_TYPES.has(question.type));
}

export async function GET(request: Request) {
  const context = await getDailyOrganisationReadContext(request, ["trainings"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.assisted && !context.capabilities?.trainings) return NextResponse.json({ formations: [] });

  const { data, error } = await context.admin
    .from("daily_formations")
    .select("id,title,status,version,learning_assessment_mode,learning_assessment_instructions,learning_assessment_questions,updated_at")
    .eq("organisation_id", context.organisationId)
    .neq("status", "archived")
    .order("title", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ formations: data ?? [] });
}

export async function PATCH(request: Request) {
  if (getAssistanceTokenFromRequest(request)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationContext(request, "trainings");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const formationId = text(body.formation_id);
  const mode = MODES.has(text(body.mode)) ? text(body.mode) : "off_platform";
  const instructions = text(body.instructions) || null;
  const questions = cleanQuestions(body.questions);

  if (!formationId) return NextResponse.json({ error: "Formation requise." }, { status: 400 });
  if (mode === "selen" && questions.length === 0) {
    return NextResponse.json({ error: "Ajoutez au moins une question pour utiliser l'évaluation Selen." }, { status: 400 });
  }
  const choiceQuestionWithoutOptions = questions.some((question) => ["single_choice", "multiple_choice"].includes(question.type) && question.options.length < 2);
  if (choiceQuestionWithoutOptions) {
    return NextResponse.json({ error: "Chaque question à choix doit proposer au moins deux réponses." }, { status: 400 });
  }
  const choiceQuestionWithoutAnswer = questions.some((question) => ["single_choice", "multiple_choice"].includes(question.type) && question.correct_answers.length === 0);
  if (mode === "selen" && choiceQuestionWithoutAnswer) {
    return NextResponse.json({ error: "Indiquez au moins une bonne réponse pour chaque question à choix." }, { status: 400 });
  }

  const { data: existing, error: existingError } = await context.admin
    .from("daily_formations")
    .select("*")
    .eq("organisation_id", context.organisationId)
    .eq("id", formationId)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
  if (existing.status === "archived") return NextResponse.json({ error: "Une version archivée ne peut pas être modifiée." }, { status: 400 });

  const {
    id: _id,
    created_at: _createdAt,
    updated_at: _updatedAt,
    archived_at: _archivedAt,
    ...copy
  } = existing;
  const now = new Date().toISOString();
  const nextStatus = existing.status === "validated" ? "review" : existing.status;
  const { data: created, error: insertError } = await context.admin
    .from("daily_formations")
    .insert({
      ...copy,
      learning_assessment_mode: mode,
      learning_assessment_instructions: mode === "selen" ? instructions : null,
      learning_assessment_questions: mode === "selen" ? questions : [],
      version: Number(existing.version ?? 1) + 1,
      previous_version_id: existing.id,
      status: nextStatus,
      archived_at: null,
      validation_note: nextStatus === "review" ? null : existing.validation_note,
      user_id: context.user.id,
      organisation_id: context.organisationId,
      updated_visible_at: now.slice(0, 10),
    })
    .select("id,title,status,version,learning_assessment_mode,learning_assessment_instructions,learning_assessment_questions,updated_at")
    .single();
  if (insertError || !created) return NextResponse.json({ error: insertError?.message ?? "Enregistrement impossible." }, { status: 500 });

  const { error: archiveError } = await context.admin
    .from("daily_formations")
    .update({ status: "archived", archived_at: now })
    .eq("organisation_id", context.organisationId)
    .eq("id", existing.id);
  if (archiveError) {
    await context.admin
      .from("daily_formations")
      .update({ status: "archived", archived_at: now })
      .eq("organisation_id", context.organisationId)
      .eq("id", created.id);
    return NextResponse.json({
      error: "La nouvelle version a été conservée mais n'a pas pu remplacer proprement la précédente. Aucune version existante n'a été supprimée.",
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true, formation: created, versioned: true });
}
