import { NextResponse } from "next/server";
import { loadOriginalPositioning, OwnPositioningError } from "@/lib/server/dailyOwnPositioning";
import { logAgentAssistanceAction } from "@/lib/server/agentAssistance";
import { getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";
import { verifyDailyAssessmentSource } from "@/lib/server/dailyAssessmentSource";
import {
  cleanPrerequisiteRequirements,
  parseDailyFormationCreationMode,
  parseDailyPrerequisiteMode,
  requiredFormationFields,
  requiresStructuredLearningObjectives,
  validateFormationCreationSource,
  validatePrerequisiteDeclaration,
} from "@/lib/dailyFormationCreationPolicy";

const STATUSES = new Set(["draft", "review", "validated", "correction_requested", "archived"]);
const MODALITIES = new Set(["presentiel", "distanciel", "mixte"]);
const POSITIONING_MODES = new Set(["off_platform", "selen"]);
const POSITIONING_TYPES = new Set(["single_choice", "multiple_choice", "free_text", "scale_1_5"]);
const ASSESSMENT_MODES = new Set(["external", "selen_quiz"]);
const ASSESSMENT_TYPES = new Set(["single_choice", "multiple_choice", "free_text"]);

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

function cleanAssessmentQuestions(value: unknown) {
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
      type: ASSESSMENT_TYPES.has(type) ? type : "single_choice",
      options: type === "free_text" ? [] : options,
      correct_answers: type === "free_text" ? [] : type === "single_choice" ? validCorrectAnswers.slice(0, 1) : validCorrectAnswers,
      points: Math.max(0.5, Number(row.points) || 1),
      required: row.required !== false,
      order: index + 1,
    };
  }).filter((question) => question.label);
}

function buildAssessmentPayload(body: Record<string, unknown>, existing?: Record<string, unknown>) {
  const supplied = Object.hasOwn(body, "learning_assessment_mode")
    || Object.hasOwn(body, "learning_assessment_instructions")
    || Object.hasOwn(body, "learning_assessment_questions")
    || Object.hasOwn(body, "learning_assessment_document_url");
  if (!supplied && existing) return { payload: {
    learning_assessment_mode: existing.learning_assessment_mode,
    learning_assessment_instructions: existing.learning_assessment_instructions,
    learning_assessment_questions: existing.learning_assessment_questions,
    learning_assessment_document_url: existing.learning_assessment_document_url,
  } };
  const mode = String(body.learning_assessment_mode ?? existing?.learning_assessment_mode ?? "external").trim();
  const instructions = String(body.learning_assessment_instructions ?? "").trim();
  const questions = cleanAssessmentQuestions(body.learning_assessment_questions);
  const source = typeof body.learning_assessment_document_url === "string" ? body.learning_assessment_document_url.trim() : "";
  if (!ASSESSMENT_MODES.has(mode)) return { error: "Mode d’évaluation invalide." };
  if (mode === "selen_quiz" && questions.length === 0) return { error: "Ajoutez au moins une question pour l’évaluation finale ou choisissez le scan après session." };
  if (mode === "selen_quiz") {
    const invalid = questions.some((question) => question.type !== "free_text" && (question.options.length < 2 || question.correct_answers.length === 0));
    if (invalid) return { error: "Chaque question à choix doit comporter au moins deux réponses distinctes et une bonne réponse." };
  }
  return { payload: {
    learning_assessment_mode: mode,
    learning_assessment_instructions: mode === "selen_quiz" ? instructions || null : null,
    learning_assessment_questions: mode === "selen_quiz" ? questions : [],
    learning_assessment_document_url: mode === "external" ? source || null : null,
  } };
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
  const creationMode = parseDailyFormationCreationMode(body.creation_mode);
  const prerequisiteMode = parseDailyPrerequisiteMode(body.prerequisite_mode);
  const prerequisiteRequirements = cleanPrerequisiteRequirements(body.prerequisite_requirements);
  const detailedProgramDocumentUrl = nullableText(body, "detailed_program_document_url");
  const sourceError = validateFormationCreationSource(creationMode, detailedProgramDocumentUrl);
  if (sourceError) return { error: sourceError };
  const prerequisiteError = validatePrerequisiteDeclaration(prerequisiteMode, prerequisiteRequirements);
  if (prerequisiteError) return { error: prerequisiteError };

  const modality = text(body, "modality");
  const status = text(body, "status") || "draft";
  const durationHours = numberValue(body, "duration_hours");
  const durationDays = numberValue(body, "duration_days");
  const learningObjectives = cleanTextArray(body.learning_objectives);
  const allowedTrainerIds = cleanTextArray(body.allowed_trainer_ids);

  if (!MODALITIES.has(modality)) return { error: "Modalité de formation invalide." };
  if (!STATUSES.has(status) || status === "validated") return { error: "Statut de formation invalide pour le client." };
  if (durationHours === null || durationHours <= 0 || durationDays === null || durationDays <= 0) return { error: "Les durées en heures et en jours doivent être renseignées." };
  if (requiresStructuredLearningObjectives(creationMode) && learningObjectives.length === 0) return { error: "Ajoutez au moins un objectif pédagogique." };

  const resultsPending = boolValue(body.results_pending);
  const positioningMode = POSITIONING_MODES.has(text(body, "positioning_mode")) ? text(body, "positioning_mode") : "off_platform";
  const positioningQuestions = cleanPositioningQuestions(body.positioning_questions);
  if (positioningMode === "selen") {
    if (positioningQuestions.length === 0) return { error: "Ajoutez au moins une question de positionnement ou choisissez votre questionnaire Word/PDF." };
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
    creation_mode: creationMode,
    prerequisite_mode: prerequisiteMode,
    prerequisite_requirements: prerequisiteRequirements,
    title: text(body, "title"), global_objective: text(body, "global_objective"), learning_objectives: learningObjectives,
    allowed_trainer_ids: allowedTrainerIds,
    target_audience: text(body, "target_audience"), prerequisites: prerequisiteMode === "none" ? "Aucun prérequis" : text(body, "prerequisites"),
    duration_hours: durationHours, duration_days: durationDays, modality, modality_details: modality,
    access_delays: text(body, "access_delays"),
    registration_methods: text(body, "registration_methods") || "Les modalités d'inscription sont préparées et suivies par Selen Daily.",
    price: text(body, "price"),
    detailed_program: text(body, "detailed_program"),
    detailed_program_document_url: detailedProgramDocumentUrl,
    positioning_questionnaire_document_url: positioningMode === "off_platform" ? nullableText(body, "positioning_questionnaire_document_url") : null,
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
  const requiredPayload = payload as Record<string, unknown>;
  const missing = requiredFormationFields(creationMode).filter((key) => !String(requiredPayload[key] ?? "").trim());
  if (missing.length > 0) return { error: creationMode === "program_import" ? "Complétez les informations minimales nécessaires en plus du programme importé." : "Tous les champs obligatoires de la formation doivent être renseignés." };
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
  const context = await getDailyOrganisationContext(req, "trainings", { allowAssistanceWrite: true });
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
      public_registration_token: registrationToken(), public_registration_enabled: true, updated_visible_at: new Date().toISOString().slice(0, 10),
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PSE01" ? 409 : 500 });
    if (context.assisted && context.assistance) await logAgentAssistanceAction({ supabase: context.admin, req, assistance: context.assistance, action: "daily_formation_duplicate", actionLabel: "Formation dupliquée par Studio pour le client", newState: { formation_id: data.id, title: data.title } });
    return NextResponse.json({ formation: data, duplicated: true, assistanceMode: context.assisted });
  }

  const built = buildPayload(body, context.user.id, context.organisationId);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });
  const assessment = buildAssessmentPayload(body);
  if ("error" in assessment) return NextResponse.json({ error: assessment.error }, { status: 400 });
  if (built.payload.positioning_mode === "off_platform" && !built.payload.positioning_questionnaire_document_url) return NextResponse.json({ error: "Importez votre questionnaire de positionnement avant d’enregistrer la formation." }, { status: 400 });
  try { await loadOriginalPositioning(context.admin, built.payload, false); }
  catch (cause) { return NextResponse.json({ error: cause instanceof OwnPositioningError ? cause.message : "Vérification du questionnaire indisponible." }, { status: cause instanceof OwnPositioningError ? cause.status : 500 }); }
  const trainerError = await validateAllowedTrainers(context.organisationId, built.payload.allowed_trainer_ids, context.admin);
  if (trainerError) return NextResponse.json({ error: trainerError }, { status: 400 });
  if (assessment.payload.learning_assessment_mode === "external" && assessment.payload.learning_assessment_document_url) {
    try { await verifyDailyAssessmentSource(context.admin, context.organisationId, "", assessment.payload.learning_assessment_document_url); }
    catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Questionnaire privé indisponible." }, { status: 409 }); }
  }
  const { data, error } = await context.admin.from("daily_formations").insert({ ...built.payload, ...assessment.payload, public_registration_token: registrationToken(), public_registration_enabled: true }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PSE01" ? 409 : 500 });
  if (context.assisted && context.assistance) await logAgentAssistanceAction({ supabase: context.admin, req, assistance: context.assistance, action: "daily_formation_create", actionLabel: "Formation créée par Studio pour le client", newState: { formation_id: data.id, title: data.title, status: data.status } });
  return NextResponse.json({ formation: data, assistanceMode: context.assisted });
}

export async function PATCH(req: Request) {
  const context = await getDailyOrganisationContext(req, "trainings", { allowAssistanceWrite: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = text(body, "id");
  if (!id) return NextResponse.json({ error: "Identifiant formation requis." }, { status: 400 });
  const expectedUpdatedAt = typeof body.expected_updated_at === "string" ? body.expected_updated_at.trim() : "";
  if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) return NextResponse.json({ error: "La version de la formation est requise. Rechargez le catalogue puis rouvrez la formation." }, { status: 400 });
  const { data: existing, error: existingError } = await context.admin.from("daily_formations").select("*").eq("id", id).eq("organisation_id", context.organisationId).maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
  if (existing.status === "archived") return NextResponse.json({ error: "Une ancienne version archivée ne peut pas être modifiée." }, { status: 400 });
  if (existing.updated_at !== expectedUpdatedAt) return NextResponse.json({ error: "Cette formation a été modifiée depuis l’ouverture du formulaire. Rechargez le catalogue pour reprendre la version actuelle." }, { status: 409 });
  // Forms opened before these controls existed omit their metadata. Preserve
  // that declaration, while an explicit "none" choice clears its evidence list.
  const prerequisiteMode = Object.hasOwn(body, "prerequisite_mode") ? body.prerequisite_mode : existing.prerequisite_mode;
  const editBody = {
    ...body,
    creation_mode: Object.hasOwn(body, "creation_mode") ? body.creation_mode : existing.creation_mode,
    detailed_program_document_url: Object.hasOwn(body, "detailed_program_document_url") ? body.detailed_program_document_url : existing.detailed_program_document_url,
    prerequisite_mode: prerequisiteMode,
    prerequisite_requirements: Object.hasOwn(body, "prerequisite_requirements") ? body.prerequisite_requirements : parseDailyPrerequisiteMode(prerequisiteMode) === "none" ? [] : existing.prerequisite_requirements,
    prerequisites: Object.hasOwn(body, "prerequisites") ? body.prerequisites : existing.prerequisites,
  };
  const built = buildPayload(editBody, context.user.id, context.organisationId);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });
  const assessment = buildAssessmentPayload(body, existing as Record<string, unknown>);
  if ("error" in assessment) return NextResponse.json({ error: assessment.error }, { status: 400 });
  const trainerError = await validateAllowedTrainers(context.organisationId, built.payload.allowed_trainer_ids, context.admin);
  if (trainerError) return NextResponse.json({ error: trainerError }, { status: 400 });
  // An unchanged historical, unconfigured mode remains editable. A new choice
  // of the OF's own questionnaire, or removal of its file, requires the import.
  const unchangedLegacyPositioning = body.positioning_choice_confirmed !== true && existing.positioning_mode === "off_platform" && !existing.positioning_questionnaire_document_url && built.payload.positioning_mode === "off_platform" && !built.payload.positioning_questionnaire_document_url;
  if (built.payload.positioning_mode === "off_platform" && !built.payload.positioning_questionnaire_document_url && !unchangedLegacyPositioning) return NextResponse.json({ error: "Importez votre questionnaire de positionnement avant d’enregistrer la formation." }, { status: 400 });
  try { await loadOriginalPositioning(context.admin, { ...built.payload, id: existing.id }, false); }
  catch (cause) { return NextResponse.json({ error: cause instanceof OwnPositioningError ? cause.message : "Vérification du questionnaire indisponible." }, { status: cause instanceof OwnPositioningError ? cause.status : 500 }); }
  if (assessment.payload.learning_assessment_mode === "external" && assessment.payload.learning_assessment_document_url) {
    try { await verifyDailyAssessmentSource(context.admin, context.organisationId, existing.id, assessment.payload.learning_assessment_document_url); }
    catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Questionnaire privé indisponible." }, { status: 409 }); }
  }

  const nextStatus = existing.status === "validated" || existing.status === "correction_requested" ? "review" : built.payload.status;
  const reviewSignaledAt = nextStatus === "review" ? new Date().toISOString() : existing.agent_review_signaled_at ?? null;
  const { data, error } = await context.admin.from("daily_formations").update({
    ...built.payload,
    ...assessment.payload,
    status: nextStatus,
    version: existing.version ?? 1,
    previous_version_id: existing.previous_version_id ?? null,
    public_registration_token: existing.public_registration_token ?? registrationToken(),
    public_registration_enabled: existing.public_registration_enabled ?? true,
    agent_review_signaled_at: reviewSignaledAt,
    validation_note: nextStatus === "review" ? null : existing.validation_note,
    archived_at: null,
  }).eq("id", existing.id).eq("organisation_id", context.organisationId).eq("status", existing.status).eq("updated_at", expectedUpdatedAt).neq("status", "archived").select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PSE01" ? 409 : 500 });
  if (!data) return NextResponse.json({ error: "Cette formation a été modifiée pendant l’enregistrement. Rechargez le catalogue pour reprendre la version actuelle." }, { status: 409 });
  if (context.assisted && context.assistance) await logAgentAssistanceAction({
    supabase: context.admin, req, assistance: context.assistance,
    action: "daily_formation_update",
    actionLabel: "Formation modifiée par Studio pour le client",
    oldState: { id: existing.id, status: existing.status, title: existing.title },
    newState: { id: data.id, status: data.status, title: data.title },
  });
  return NextResponse.json({ formation: data, versioned: false, retainedVersion: true, assistanceMode: context.assisted });

}

export async function DELETE(req: Request) {
  const context = await getDailyOrganisationContext(req, "trainings", { allowAssistanceWrite: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = text(body, "id");
  if (!id) return NextResponse.json({ error: "Identifiant formation requis." }, { status: 400 });
  const hardDelete = body.hardDelete === true;
  if (!hardDelete) {
    const { data: current, error: currentError } = await context.admin.from("daily_formations").select("id,status").eq("id", id).eq("organisation_id", context.organisationId).maybeSingle();
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
    if (!current) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
    if (current.status === "archived") return NextResponse.json({ ok: true, archived: true, assistanceMode: context.assisted });
    const { data, error } = await context.admin.from("daily_formations").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", id).eq("organisation_id", context.organisationId).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (context.assisted && context.assistance) await logAgentAssistanceAction({ supabase: context.admin, req, assistance: context.assistance, action: "daily_formation_archive", actionLabel: "Formation archivée par Studio pour le client", newState: { formation_id: data.id, status: data.status } });
    return NextResponse.json({ formation: data, archived: true, assistanceMode: context.assisted });
  }
  const { data: existing, error: existingError } = await context.admin.from("daily_formations").select("id,title,status").eq("id", id).eq("organisation_id", context.organisationId).maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
  const dependencyChecks = [
    ["daily_sessions", "formation_id", "une ou plusieurs sessions"],
    ["daily_documents", "formation_id", "des documents ou preuves"],
    ["daily_formations", "previous_version_id", "un historique de versions"],
  ] as const;
  for (const [table, column, label] of dependencyChecks) {
    const { data, error } = await context.admin.from(table).select("id").eq("organisation_id", context.organisationId).eq(column, id).limit(1);
    if (error) return NextResponse.json({ error: "Impossible de vérifier les dépendances de cette formation. Aucune suppression n’a été effectuée." }, { status: 500 });
    if ((data ?? []).length) return NextResponse.json({ error: `Suppression impossible : cette formation possède ${label}. L’historique doit être conservé.`, deletionBlocked: true, canArchive: true }, { status: 409 });
  }
  // Les candidatures sont rattachées à la formation elle-même et ne portent pas organisation_id.
  // L'appartenance de la formation à l'OF a déjà été vérifiée ci-dessus.
  const { data: registrationRequests, error: registrationError } = await context.admin.from("daily_formation_registration_requests").select("id").eq("formation_id", id).limit(1);
  if (registrationError) return NextResponse.json({ error: "Impossible de vérifier les demandes d’inscription de cette formation. Aucune suppression n’a été effectuée." }, { status: 500 });
  if ((registrationRequests ?? []).length) return NextResponse.json({ error: "Suppression impossible : cette formation possède des demandes d’inscription. L’historique doit être conservé.", deletionBlocked: true, canArchive: true }, { status: 409 });
  const { error } = await context.admin.from("daily_formations").delete().eq("id", id).eq("organisation_id", context.organisationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (context.assisted && context.assistance) await logAgentAssistanceAction({ supabase: context.admin, req, assistance: context.assistance, action: "daily_formation_delete", actionLabel: "Suppression d’une formation vierge par Studio pour le client", oldState: { id: existing.id, title: existing.title, status: existing.status }, newState: null });
  return NextResponse.json({ ok: true, deleted: true, assistanceMode: context.assisted });
}
