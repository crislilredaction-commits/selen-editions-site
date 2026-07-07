import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import {
  blockedAgentAssistanceResponse,
  getAssistanceTokenFromRequest,
  getAssistedClientUser,
} from "@/lib/server/agentAssistance";

const REQUIRED_FIELDS = [
  "title",
  "global_objective",
  "target_audience",
  "prerequisites",
  "duration_hours",
  "duration_days",
  "modality",
  "modality_details",
  "access_delays",
  "price",
  "detailed_program",
  "pedagogical_resources",
  "evaluation_methods",
  "contact_phone",
  "contact_email",
];

const STATUSES = new Set(["draft", "review", "validated", "correction_requested", "archived"]);
const MODALITIES = new Set(["presentiel", "distanciel", "mixte"]);
const POSITIONING_MODES = new Set(["off_platform", "selen"]);
const POSITIONING_TYPES = new Set(["single_choice", "multiple_choice", "free_text", "scale_1_5"]);

function registrationToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

async function requireClient() {
  const authSupabase = await createServerSupabaseClient();
  const { data, error } = await authSupabase.auth.getUser();
  const user = data.user;
  if (error || !user?.id) {
    return { ok: false as const, error: "Connexion client requise.", status: 401 };
  }
  return { ok: true as const, user };
}

function text(body: Record<string, unknown>, key: string) {
  return String(body[key] ?? "").trim();
}

function nullableText(body: Record<string, unknown>, key: string) {
  const value = text(body, key);
  return value || null;
}

function numberValue(body: Record<string, unknown>, key: string) {
  const value = Number(String(body[key] ?? "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function intValue(body: Record<string, unknown>, key: string) {
  const value = numberValue(body, key);
  return value === null ? null : Math.max(0, Math.round(value));
}

function boolValue(value: unknown) {
  return value === true || value === "true" || value === "on";
}

function cleanPositioningQuestions(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((raw, index) => {
      const question = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const type = String(question.type ?? "").trim();
      const label = String(question.label ?? "").trim();
      const helpText = String(question.help_text ?? "").trim();
      const rawOptions = Array.isArray(question.options) ? question.options : [];
      const options = rawOptions
        .map((option) => String(option ?? "").trim())
        .filter(Boolean);

      return {
        id: String(question.id ?? `question_${Date.now()}_${index}`).trim(),
        label,
        help_text: helpText,
        required: boolValue(question.required),
        type,
        options,
        order: Number.isFinite(Number(question.order)) ? Number(question.order) : index + 1,
      };
    })
    .filter((question) => question.label && POSITIONING_TYPES.has(question.type))
    .map((question, index) => ({
      ...question,
      id: question.id || `question_${index + 1}`,
      order: index + 1,
      options: ["single_choice", "multiple_choice"].includes(question.type)
        ? question.options
        : [],
    }));
}

function buildPayload(body: Record<string, unknown>, userId: string) {
  const modality = text(body, "modality");
  const status = text(body, "status") || "draft";
  const durationHours = numberValue(body, "duration_hours");
  const durationDays = numberValue(body, "duration_days");

  if (!MODALITIES.has(modality)) {
    return { error: "Modalite de formation invalide." };
  }
  if (!STATUSES.has(status) || status === "validated") {
    return { error: "Statut de formation invalide pour le client." };
  }
  if (durationHours === null || durationHours <= 0 || durationDays === null || durationDays <= 0) {
    return { error: "Les durees en heures et en jours doivent etre renseignees." };
  }

  const resultsPending = boolValue(body.results_pending);
  const positioningMode = POSITIONING_MODES.has(text(body, "positioning_mode"))
    ? text(body, "positioning_mode")
    : "off_platform";
  const positioningQuestions = cleanPositioningQuestions(body.positioning_questions);
  if (positioningMode === "selen") {
    if (positioningQuestions.length === 0) {
      return { error: "Ajoutez au moins une question de positionnement ou choisissez le positionnement hors plateforme." };
    }
    const questionWithoutOptions = positioningQuestions.find(
      (question) => ["single_choice", "multiple_choice"].includes(question.type) && question.options.length === 0,
    );
    if (questionWithoutOptions) {
      return { error: "Les questions a choix doivent proposer au moins une option." };
    }
  }
  if (!resultsPending) {
    const satisfaction = numberValue(body, "result_satisfaction_rate");
    const success = numberValue(body, "result_success_rate");
    if (
      satisfaction !== null &&
      (satisfaction < 0 || satisfaction > 100) ||
      success !== null &&
      (success < 0 || success > 100)
    ) {
      return { error: "Les taux de resultats doivent etre compris entre 0 et 100." };
    }
  }

  const payload = {
    user_id: userId,
    title: text(body, "title"),
    global_objective: text(body, "global_objective"),
    target_audience: text(body, "target_audience"),
    prerequisites: text(body, "prerequisites"),
    duration_hours: durationHours,
    duration_days: durationDays,
    modality,
    modality_details: text(body, "modality_details"),
    access_delays: text(body, "access_delays"),
    registration_methods:
      text(body, "registration_methods") ||
      "Les modalités d'inscription sont préparées et suivies par Selen Daily.",
    price: text(body, "price"),
    detailed_program: text(body, "detailed_program"),
    detailed_program_document_url: nullableText(body, "detailed_program_document_url"),
    accessibility:
      text(body, "accessibility") ||
      "La formation est accessible aux personnes en situation de handicap. Les besoins d'adaptation sont analysés dans le dossier d'inscription et suivis par Selen.",
    disability_referent: nullableText(body, "disability_referent"),
    pedagogical_resources: text(body, "pedagogical_resources"),
    evaluation_methods: text(body, "evaluation_methods"),
    result_beneficiary_count: resultsPending ? null : intValue(body, "result_beneficiary_count"),
    result_satisfaction_rate: resultsPending ? null : numberValue(body, "result_satisfaction_rate"),
    result_success_rate: resultsPending ? null : numberValue(body, "result_success_rate"),
    results_pending: resultsPending,
    contact_phone: text(body, "contact_phone"),
    contact_email: text(body, "contact_email").toLowerCase(),
    contact_website: nullableText(body, "contact_website"),
    updated_visible_at: new Date().toISOString().slice(0, 10),
    positioning_mode: positioningMode,
    positioning_questions: positioningMode === "selen" ? positioningQuestions : [],
    status,
  };

  const missing = REQUIRED_FIELDS.filter((key) => !String(payload[key as keyof typeof payload] ?? "").trim());
  if (missing.length > 0) {
    return { error: "Tous les champs obligatoires de la formation doivent etre renseignes." };
  }

  return { payload };
}

export async function GET(req: Request) {
  const supabase = getAdminSupabase();
  const assisted = await getAssistedClientUser(supabase, req);
  const auth = assisted
    ? { ok: true as const, user: assisted.user }
    : await requireClient();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await supabase
    .from("daily_formations")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ formations: data ?? [] });
}

export async function POST(req: Request) {
  if (getAssistanceTokenFromRequest(req)) return blockedAgentAssistanceResponse();

  const auth = await requireClient();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const built = buildPayload(body, auth.user.id);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("daily_formations")
    .insert({
      ...built.payload,
      public_registration_token: registrationToken(),
      public_registration_enabled: true,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ formation: data });
}

export async function PATCH(req: Request) {
  if (getAssistanceTokenFromRequest(req)) return blockedAgentAssistanceResponse();

  const auth = await requireClient();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const id = text(body, "id");
  if (!id) return NextResponse.json({ error: "Identifiant formation requis." }, { status: 400 });

  const built = buildPayload(body, auth.user.id);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  const supabase = getAdminSupabase();
  const { data: existing, error: existingError } = await supabase
    .from("daily_formations")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
  if (existing.status === "archived") {
    return NextResponse.json({ error: "Remettez la formation active avant de la modifier." }, { status: 400 });
  }

  if (existing.status === "validated") {
    const { data: created, error: insertError } = await supabase
      .from("daily_formations")
      .insert({
        ...built.payload,
        status: "review",
        version: Number(existing.version ?? 1) + 1,
        previous_version_id: existing.id,
      })
      .select("*")
      .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    await supabase
      .from("daily_formations")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("user_id", auth.user.id);

    return NextResponse.json({ formation: created, versioned: true });
  }

  const { data, error } = await supabase
    .from("daily_formations")
    .update(built.payload)
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ formation: data });
}

export async function DELETE(req: Request) {
  if (getAssistanceTokenFromRequest(req)) return blockedAgentAssistanceResponse();

  const auth = await requireClient();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const id = text(body, "id");
  if (!id) return NextResponse.json({ error: "Identifiant formation requis." }, { status: 400 });

  const supabase = getAdminSupabase();
  const { count, error: countError } = await supabase
    .from("daily_sessions")
    .select("id", { count: "exact", head: true })
    .eq("formation_id", id)
    .eq("user_id", auth.user.id)
    .neq("status", "archived");

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  if ((count ?? 0) > 0) {
    const { data, error } = await supabase
      .from("daily_formations")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ formation: data, archived: true });
  }

  const { error } = await supabase
    .from("daily_formations")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: true });
}
