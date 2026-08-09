import { NextResponse } from "next/server";
import { blockedAgentAssistanceResponse, getAssistanceTokenFromRequest } from "@/lib/server/agentAssistance";
import {
  getDailyOrganisationBillingUserId,
  getDailyOrganisationContext,
  getDailyOrganisationReadContext,
} from "@/lib/server/dailyOrganisationContext";

const MODALITIES = new Set(["presentiel", "distanciel", "mixte"]);
const DISTANCE_MODES = new Set(["synchrone", "asynchrone"]);
const STATUSES = new Set(["draft", "ready", "archived"]);

function text(body: Record<string, unknown>, key: string) {
  return String(body[key] ?? "").trim();
}

function nullableText(body: Record<string, unknown>, key: string) {
  const value = text(body, key);
  return value || null;
}

function nullableDate(body: Record<string, unknown>, key: string) {
  const value = text(body, key);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function positiveInteger(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function registrationToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

function participantRow(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const legacyName = text(row, "name");
  const firstName = text(row, "first_name") || legacyName.split(" ").slice(0, -1).join(" ");
  const lastName = text(row, "last_name") || legacyName.split(" ").slice(-1).join(" ");
  const email = text(row, "email").toLowerCase();
  const phone = text(row, "phone");

  if (!firstName && !lastName && !email && !phone) return null;
  return { first_name: firstName, last_name: lastName, email, phone };
}

function companyRow(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = text(row, "name");
  const address = text(row, "address");
  const siret = text(row, "siret");
  const email = text(row, "email").toLowerCase();
  const participants = jsonArray(row.participants).map(participantRow).filter(Boolean);

  if (!name && !address && !siret && !email && participants.length === 0) return null;
  return { name, address, siret, email, participants };
}

function cleanSchedule(value: unknown, startDate: string, endDate: string) {
  const blocks = jsonArray(value).map((raw) => {
    const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    return {
      date: text(row, "date"),
      start: text(row, "start"),
      end: text(row, "end"),
      note: text(row, "note"),
    };
  }).filter((block) => block.date || block.start || block.end || block.note);

  if (blocks.length === 0) return { error: "Ajoutez au moins une journée ou un bloc horaire." };
  for (const block of blocks) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(block.date) || !/^\d{2}:\d{2}$/.test(block.start) || !/^\d{2}:\d{2}$/.test(block.end)) {
      return { error: "Chaque bloc horaire doit comporter une date, une heure de début et une heure de fin." };
    }
    if (block.end <= block.start) return { error: "L'heure de fin d'un bloc doit être postérieure à son heure de début." };
    if (block.date < startDate || block.date > endDate) {
      return { error: "Chaque bloc horaire doit être compris entre la date de début et la date de fin de la session." };
    }
  }

  return { blocks };
}

function buildPayload(body: Record<string, unknown>, userId: string, organisationId: string) {
  const formationId = text(body, "formation_id");
  const modality = text(body, "modality");
  const status = text(body, "status") || "ready";
  const distanceMode = text(body, "distance_mode");
  const startDate = nullableDate(body, "start_date");
  const endDate = nullableDate(body, "end_date");
  const maxParticipantsRaw = body.max_participants;
  const maxParticipants = positiveInteger(maxParticipantsRaw);

  if (!formationId) return { error: "Sélectionnez une formation." };
  if (!MODALITIES.has(modality)) return { error: "Modalité de session invalide." };
  if (!STATUSES.has(status)) return { error: "Statut de session invalide." };
  if (modality === "distanciel" && !DISTANCE_MODES.has(distanceMode)) {
    return { error: "Précisez si la session à distance est en direct ou à son rythme." };
  }
  if (!startDate || !endDate) return { error: "Renseignez la date de début et la date de fin de la session." };
  if (endDate < startDate) return { error: "La date de fin doit être postérieure ou égale à la date de début." };
  if (maxParticipantsRaw !== null && maxParticipantsRaw !== undefined && String(maxParticipantsRaw).trim() !== "" && maxParticipants === null) {
    return { error: "La capacité maximale doit être un nombre entier supérieur à zéro." };
  }

  const schedule = cleanSchedule(body.schedule_blocks, startDate, endDate);
  if ("error" in schedule) return schedule;

  const payload = {
    user_id: userId,
    organisation_id: organisationId,
    formation_id: formationId,
    internal_reference: nullableText(body, "internal_reference"),
    max_participants: maxParticipants,
    modality,
    start_date: startDate,
    end_date: endDate,
    distance_mode: modality === "distanciel" ? distanceMode : null,
    blended_elearning_periods: modality === "mixte" ? nullableText(body, "blended_elearning_periods") : null,
    blended_in_person_days: modality === "mixte" ? nullableText(body, "blended_in_person_days") : null,
    schedule_blocks: schedule.blocks,
    location_address:
      modality === "presentiel" || modality === "mixte" ? nullableText(body, "location_address") : null,
    remote_url: modality === "distanciel" || modality === "mixte" ? nullableText(body, "remote_url") : null,
    companies: jsonArray(body.companies).map(companyRow).filter(Boolean),
    beneficiaries: jsonArray(body.beneficiaries).map(participantRow).filter(Boolean),
    individual_beneficiaries: jsonArray(body.individual_beneficiaries).map(participantRow).filter(Boolean),
    trainer_ids: [...new Set(jsonArray(body.trainer_ids).map(String).map((id) => id.trim()).filter(Boolean))],
    status,
  };

  if ((modality === "presentiel" || modality === "mixte") && !payload.location_address) {
    return { error: "Renseignez l'adresse physique de la session." };
  }
  if ((modality === "distanciel" || modality === "mixte") && !payload.remote_url) {
    return { error: "Renseignez le lien visio ou la plateforme." };
  }

  return { payload };
}

async function validateTrainerIds(
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
  if (error) return "Impossible de vérifier les formateurs sélectionnés.";
  if ((data ?? []).length !== trainerIds.length) return "Un formateur sélectionné n'appartient pas à cet organisme ou n'est plus actif.";
  return null;
}

async function refreshLearnerTier(organisationId: string, actingUserId: string, admin: ReturnType<typeof import("@/lib/server/clientNdaAccess").getAdminSupabase>) {
  const billingUserId = await getDailyOrganisationBillingUserId(organisationId, actingUserId);
  const { data: learnerCount, error } = await admin.rpc("daily_prepare_upper_tier_if_needed", {
    p_user_id: billingUserId,
  });
  if (error) return null;
  return learnerCount ?? null;
}

export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["trainings", "sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  if (!context.assisted && !context.capabilities?.sessions) {
    return NextResponse.json({ sessions: [] });
  }

  const { data, error } = await context.admin
    .from("daily_sessions")
    .select("*, daily_formations(id,title,status,version), daily_registration_recipients(id,recipient_type,recipient_name,recipient_email,status,sent_at,last_error), daily_conventions(id,recipient_type,recipient_key,recipient_name,company_name,version,document_name,status,generated_at,daily_convention_signatures(id,signatory_type,signatory_name,status,signed_at)), daily_convocations(id,recipient_type,recipient_key,recipient_name,company_name,version,document_name,status,sent_at,generated_at), daily_portal_access_tokens(id,portal_type,entity_name,entity_email,token,status,viewed_at)")
    .eq("organisation_id", context.organisationId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(req: Request) {
  if (getAssistanceTokenFromRequest(req)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationContext(req, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  if (text(body, "action") === "duplicate") {
    const sourceId = text(body, "id");
    if (!sourceId) return NextResponse.json({ error: "Session source requise." }, { status: 400 });
    const { data: source, error: sourceError } = await context.admin
      .from("daily_sessions")
      .select("*")
      .eq("id", sourceId)
      .eq("organisation_id", context.organisationId)
      .maybeSingle();
    if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
    if (!source) return NextResponse.json({ error: "Session source introuvable." }, { status: 404 });

    const {
      id: _id,
      created_at: _createdAt,
      updated_at: _updatedAt,
      registration_token: _registrationToken,
      registration_status: _registrationStatus,
      registration_summary: _registrationSummary,
      adaptation_needed: _adaptationNeeded,
      registration_prepared_at: _preparedAt,
      registration_sent_at: _sentAt,
      registration_responses_received_at: _responsesAt,
      registration_summary_validated_at: _validatedAt,
      ...copy
    } = source;

    const { data, error } = await context.admin
      .from("daily_sessions")
      .insert({
        ...copy,
        user_id: context.user.id,
        organisation_id: context.organisationId,
        internal_reference: source.internal_reference ? `${source.internal_reference}-COPIE` : null,
        status: "draft",
        registration_token: registrationToken(),
        registration_status: "to_prepare",
        registration_summary: {},
        adaptation_needed: false,
        registration_prepared_at: null,
        registration_sent_at: null,
        registration_responses_received_at: null,
        registration_summary_validated_at: null,
      })
      .select("*, daily_formations(id,title,status,version)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ session: data, duplicated: true });
  }

  const built = buildPayload(body, context.user.id, context.organisationId);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  const { data: formation, error: formationError } = await context.admin
    .from("daily_formations")
    .select("id,status")
    .eq("id", built.payload.formation_id)
    .eq("organisation_id", context.organisationId)
    .neq("status", "archived")
    .maybeSingle();

  if (formationError) return NextResponse.json({ error: formationError.message }, { status: 500 });
  if (!formation) return NextResponse.json({ error: "Formation introuvable ou archivée." }, { status: 404 });

  const trainerError = await validateTrainerIds(context.organisationId, built.payload.trainer_ids, context.admin);
  if (trainerError) return NextResponse.json({ error: trainerError }, { status: 400 });

  const { data, error } = await context.admin
    .from("daily_sessions")
    .insert({ ...built.payload, registration_token: registrationToken(), registration_status: "to_prepare" })
    .select("*, daily_formations(id,title,status,version)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const learnerCount = await refreshLearnerTier(context.organisationId, context.user.id, context.admin);
  return NextResponse.json({
    session: data,
    annualLearnerCount: learnerCount,
    validationWarning:
      formation.status !== "validated"
        ? "La session peut être préparée, mais les documents officiels ne devront partir qu'après validation des éléments de formation requis."
        : null,
  });
}

export async function PATCH(req: Request) {
  if (getAssistanceTokenFromRequest(req)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationContext(req, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = text(body, "id");
  if (!id) return NextResponse.json({ error: "Identifiant session requis." }, { status: 400 });

  const built = buildPayload(body, context.user.id, context.organisationId);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  const { data: formation, error: formationError } = await context.admin
    .from("daily_formations")
    .select("id")
    .eq("id", built.payload.formation_id)
    .eq("organisation_id", context.organisationId)
    .neq("status", "archived")
    .maybeSingle();
  if (formationError) return NextResponse.json({ error: formationError.message }, { status: 500 });
  if (!formation) return NextResponse.json({ error: "Formation introuvable ou archivée." }, { status: 404 });

  const trainerError = await validateTrainerIds(context.organisationId, built.payload.trainer_ids, context.admin);
  if (trainerError) return NextResponse.json({ error: trainerError }, { status: 400 });

  const { data, error } = await context.admin
    .from("daily_sessions")
    .update(built.payload)
    .eq("id", id)
    .eq("organisation_id", context.organisationId)
    .select("*, daily_formations(id,title,status,version)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const learnerCount = await refreshLearnerTier(context.organisationId, context.user.id, context.admin);
  return NextResponse.json({ session: data, annualLearnerCount: learnerCount });
}

export async function DELETE(req: Request) {
  if (getAssistanceTokenFromRequest(req)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationContext(req, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = text(body, "id");
  if (!id) return NextResponse.json({ error: "Identifiant session requis." }, { status: 400 });

  const { data, error } = await context.admin
    .from("daily_sessions")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("organisation_id", context.organisationId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data, archived: true });
}
