import { NextResponse } from "next/server";
import { blockedAgentAssistanceResponse, getAssistanceTokenFromRequest } from "@/lib/server/agentAssistance";
import { getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

const REQUIRED_FIELDS = [
  "title", "global_objective", "target_audience", "prerequisites", "duration_hours", "duration_days",
  "modality", "access_delays", "price", "pedagogical_resources", "evaluation_methods", "contact_phone", "contact_email",
];
const STATUSES = new Set(["draft", "review", "validated", "correction_requested", "archived"]);
const MODALITIES = new Set(["presentiel", "distanciel", "mixte"]);
const POSITIONING_MODES = new Set(["off_platform", "selen"]);
const POSITIONING_TYPES = new Set(["single_choice", "multiple_choice", "free_text", "scale_1_5"]);

function registrationToken() { return crypto.randomUUID().replaceAll("-", ""); }
function text(body: Record<string, unknown>, key: string) { return String(body[key] ?? "").trim(); }
function nullableText(body: Record<string, unknown>, key: string) { return text(body, key) || null; }
function numberValue(body: Record<string, unknown>, key: string) {
  const value = Number(String(body[key] ?? "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}
function intValue(body: Record<string, unknown>, key: string) {
  const value = numberValue(body, key);
  return value === null ? null : Math.max(0, Math.round(value));
}
function boolValue(value: unknown) { return value === true || value === "true" || value === "on"; }
function cleanTextArray(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))] : [];
}
function cleanPositioningQuestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const question = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const type = String(question.type ?? "").trim();
    const options = Array.isArray(question.options) ? question.options.map((option) => String(option ?? "").trim()).filter(Boolean) : [];
    return {
      id: String(question.id ?? `question_${index + 1}`).trim() || `question_${index + 1}`,
      label: String(question.label ?? "").trim(),
      help_text: String(question.help_text ?? "").trim(),
      required: boolValue(question.required),
      type,
      options: ["single_choice", "multiple_choice"].includes(type) ? options : [],
      order: index + 1,
    };
  }).filter((question) => question.label && POSITIONING_TYPES.has(question.type));
}

async function validateAllowedTrainers(
  organisationId: string,
  trainerIds: string[],
  admin: ReturnType<typeof import("@/lib/server/clientNdaAccess").getAdminSupabase>,
) {
  if (trainerIds.length === 0) return null;
  const { data, error } = await admin
    .from("daily_trainer_profiles")
    .select("id,status")
    .eq("organisation_id", organisationId)
    .in("id", trainerIds)
    .not("status", "in", "(rejected,archived)");
  if (error) return "Impossible de vérifier les formateurs autorisés.";
  if ((data ?? []).length !== trainerIds.length) return "Un formateur autorisé n'appartient pas à cet organisme ou n'est plus actif.";
  return null;
}

function buildPayload(body: Record<string, unknown>, userId: string, organisationId: string) {
  const modality = text(body, "modality");
  const status = text(body, "status") || "draft";
  const durationHours = numberValue(body, "duration_hours");
  const durationDays = numberValue(body, "duration_days");
  const learningObjectives = cleanTextArray(body.learning_objectives);
  const allowedTrainerIds = cleanTextArray(body.allowed_trainer_ids);

  if (!MODALITIES.has(modality)) return { error: "Modalité de formation invalide." };
  if (!STATUSES.has(status) || status === "validated") return { error: "Statut de formation invalide pour le client." };
  if (durationHours === null || durationHours <= 0 || durationDays === null || durationDays <= 0) return { error: "Les durées en heures et en jours doivent être renseignées." };
  if (learningObjectives.length === 0) return { error: "Ajoutez au moins un objectif pédagogique." };

  const resultsPending = boolValue(body.results_pending);
  const positioningMode = POSITIONING_MODES.has(text(body, "positioning_mode")) ? text(body, "positioning_mode") : "off_platform";
  const positioningQuestions = cleanPositioningQuestions(body.positioning_questions);
  if (positioningMode === "selen") {
    if (positioningQuestions.length === 0) return { error: "Ajoutez au moins une question de positionnement ou choisissez le positionnement hors plateforme." };
    if (positioningQuestions.some((q) => ["single_choice", "multiple_choice"].includes(q.type) && q.options.length === 0)) {
      return { error: "Les questions à choix doivent proposer au moins une option." };
    }
  }
  if (!resultsPending) {
    const satisfaction = numberValue(body, "result_satisfaction_rate");
    const success = numberValue(body, "result_success_rate");
    if ((satisfaction !== null && (satisfaction < 0 || satisfaction > 100)) || (success !== null && (success < 0 || success > 100))) {
      return { error: "Les taux de résultats doivent être compris entre 0 et 100." };
    }
  }

  const payload = {
    user_id: userId,
    organisation_id: organisationId,
    title: text(body, "title"), global_objective: text(body, "global_objective"), learning_objectives: learningObjectives,
    allowed_trainer_ids: allowedTrainerIds,
    target_audience: text(body, "target_audience"), prerequisites: text(body, "prerequisites"),
    duration_hours: durationHours, duration_days: durationDays, modality, modality_details: text(body, "modality_details") || modality,
    access_delays: text(body, "access_delays"),
    registration_methods: text(body, "registration_methods") || "Les modalités d'inscription sont préparées et suivies par Selen Daily.",
    price: text(body, "price"), detailed_program: text(body, "detailed_program"), detailed_program_document_url: nullableText(body, "detailed_program_document_url"),
    accessibility: text(body, "accessibility") || "La formation est accessible aux personnes en situation de handicap. Les besoins d'adaptation sont analysés dans le dossier d'inscription et suivis par Selen.",
    disability_referent: nullableText(body, "disability_referent"), pedagogical_methods: text(body, "pedagogical_methods") || text(body, "pedagogical_resources"),
    pedagogical_resources: text(body, "pedagogical_resources"), evaluation_methods: text(body, "evaluation_methods"),
    result_beneficiary_count: resultsPending ? null : intValue(body, "result_beneficiary_count"),
    result_satisfaction_rate: resultsPending ? null : numberValue(body, "result_satisfaction_rate"),
    result_success_rate: resultsPending ? null : numberValue(body, "result_success_rate"), results_pending: resultsPending,
    contact_phone: text(body, "contact_phone"), contact_email: text(body, "contact_email").toLowerCase(), contact_website: nullableText(body, "contact_website"),
    updated_visible_at: new Date().toISOString().slice(0, 10), positioning_mode: positioningMode,
    positioning_questions: positioningMode === "selen" ? positioningQuestions : [], status,
  };
  const missing = REQUIRED_FIELDS.filter((key) => !String(payload[key as keyof typeof payload] ?? "").trim());
  if (missing.length > 0) return { error: "Tous les champs obligatoires de la formation doivent être renseignés." };
  return { payload };
}

export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["trainings", "sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const { data, error } = await context.admin.from("daily_formations").select("*").eq("organisation_id", context.organisationId).order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ formations: data ?? [] });
}

export async function POST(req: Request) {
  if (getAssistanceTokenFromRequest(req)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationContext(req, "trainings");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  if (text(body, "action") === "duplicate") {
    const sourceId = text(body, "id");
    if (!sourceId) return NextResponse.json({ error: "Formation source requise." }, { status: 400 });
    const { data: source, error: sourceError } = await context.admin.from("daily_formations").select("*").eq("id", sourceId).eq("organisation_id", context.organisationId).maybeSingle();
    if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
    if (!source) return NextResponse.json({ error: "Formation source introuvable." }, { status: 404 });
    const { id: _id, created_at: _createdAt, updated_at: _updatedAt, archived_at: _archivedAt, validation_note: _validationNote, previous_version_id: _previousVersionId, public_registration_token: _publicRegistrationToken, ...copy } = source;
    const { data, error } = await context.admin.from("daily_formations").insert({
      ...copy, user_id: context.user.id, organisation_id: context.organisationId, title: `${source.title} — copie`, status: "draft", version: 1,
      validation_note: null, previous_version_id: null, archived_at: null, spontaneous_registration_task_status: "none",
      public_registration_token: registrationToken(), updated_visible_at: new Date().toISOString().slice(0, 10),
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ formation: data, duplicated: true });
  }

  const built = buildPayload(body, context.user.id, context.organisationId);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });
  const trainerError = await validateAllowedTrainers(context.organisationId, built.payload.allowed_trainer_ids, context.admin);
  if (trainerError) return NextResponse.json({ error: trainerError }, { status: 400 });
  const { data, error } = await context.admin.from("daily_formations").insert({ ...built.payload, public_registration_token: registrationToken(), public_registration_enabled: true }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ formation: data });
}

export async function PATCH(req: Request) {
  if (getAssistanceTokenFromRequest(req)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationContext(req, "trainings");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = text(body, "id");
  if (!id) return NextResponse.json({ error: "Identifiant formation requis." }, { status: 400 });
  const built = buildPayload(body, context.user.id, context.organisationId);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });
  const trainerError = await validateAllowedTrainers(context.organisationId, built.payload.allowed_trainer_ids, context.admin);
  if (trainerError) return NextResponse.json({ error: trainerError }, { status: 400 });
  const { data: existing, error: existingError } = await context.admin.from("daily_formations").select("*").eq("id", id).eq("organisation_id", context.organisationId).maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
  if (existing.status === "archived") return NextResponse.json({ error: "Une ancienne version archivée ne peut pas être modifiée." }, { status: 400 });

  // Un brouillon n'est pas encore une version publiée : le modifier en place évite
  // de créer artificiellement une nouvelle version et conserve son token public unique.
  if (existing.status === "draft") {
    const { data, error } = await context.admin.from("daily_formations").update({
      ...built.payload,
      learning_assessment_mode: existing.learning_assessment_mode,
      learning_assessment_instructions: existing.learning_assessment_instructions,
      learning_assessment_questions: existing.learning_assessment_questions,
      status: built.payload.status,
      version: existing.version ?? 1,
      previous_version_id: existing.previous_version_id ?? null,
      public_registration_token: existing.public_registration_token ?? registrationToken(),
      public_registration_enabled: existing.public_registration_enabled ?? true,
      archived_at: null,
    }).eq("id", existing.id).eq("organisation_id", context.organisationId).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ formation: data, versioned: false, retainedVersion: true });
  }

  const nextStatus = existing.status === "validated" ? "review" : built.payload.status;
  const archivedAt = new Date().toISOString();
  const { data: created, error: insertError } = await context.admin.from("daily_formations").insert({
    ...built.payload,
    learning_assessment_mode: existing.learning_assessment_mode,
    learning_assessment_instructions: existing.learning_assessment_instructions,
    learning_assessment_questions: existing.learning_assessment_questions,
    status: nextStatus,
    version: Number(existing.version ?? 1) + 1,
    previous_version_id: existing.id,
    public_registration_token: existing.public_registration_token ?? registrationToken(),
    public_registration_enabled: existing.public_registration_enabled ?? true,
  }).select("*").single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { error: archiveError } = await context.admin.from("daily_formations").update({ status: "archived", archived_at: archivedAt }).eq("id", existing.id).eq("organisation_id", context.organisationId);
  if (archiveError) {
    await context.admin.from("daily_formations").update({ status: "archived", archived_at: archivedAt }).eq("id", created.id).eq("organisation_id", context.organisationId);
    return NextResponse.json({ error: "La nouvelle version a été conservée mais n'a pas pu remplacer proprement la version précédente. Aucun programme actif n'a été écrasé." }, { status: 500 });
  }

  return NextResponse.json({ formation: created, versioned: nextStatus === "review", retainedVersion: true });
}

export async function DELETE(req: Request) {
  if (getAssistanceTokenFromRequest(req)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationContext(req, "trainings");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = text(body, "id");
  if (!id) return NextResponse.json({ error: "Identifiant formation requis." }, { status: 400 });

  const { data: existing, error: existingError } = await context.admin.from("daily_formations").select("id,status").eq("id", id).eq("organisation_id", context.organisationId).maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
  if (existing.status === "archived") return NextResponse.json({ ok: true, archived: true });

  const { data, error } = await context.admin.from("daily_formations").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", id).eq("organisation_id", context.organisationId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ formation: data, archived: true });
}