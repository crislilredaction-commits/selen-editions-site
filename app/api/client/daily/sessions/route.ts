import { NextResponse } from "next/server";
import { blockedAgentAssistanceResponse, getAssistanceTokenFromRequest } from "@/lib/server/agentAssistance";
import {
  getDailyOrganisationBillingUserId,
  getDailyOrganisationContext,
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

function buildPayload(body: Record<string, unknown>, userId: string, organisationId: string) {
  const formationId = text(body, "formation_id");
  const modality = text(body, "modality");
  const status = text(body, "status") || "ready";
  const distanceMode = text(body, "distance_mode");
  const startDate = nullableDate(body, "start_date");
  const endDate = nullableDate(body, "end_date");

  if (!formationId) return { error: "Selectionnez une formation." };
  if (!MODALITIES.has(modality)) return { error: "Modalite de session invalide." };
  if (!STATUSES.has(status)) return { error: "Statut de session invalide." };
  if (modality === "distanciel" && !DISTANCE_MODES.has(distanceMode)) {
    return { error: "Precisez si la session a distance est en direct ou a son rythme." };
  }
  if (!startDate || !endDate) return { error: "Renseignez la date de debut et la date de fin de la session." };
  if (endDate < startDate) return { error: "La date de fin doit etre posterieure ou egale a la date de debut." };

  const scheduleBlocks = jsonArray(body.schedule_blocks).filter((block) => {
    if (!block || typeof block !== "object") return false;
    const row = block as Record<string, unknown>;
    return text(row, "date") || text(row, "start") || text(row, "end");
  });
  if (scheduleBlocks.length === 0) return { error: "Ajoutez au moins une journee ou un bloc horaire." };

  const payload = {
    user_id: userId,
    organisation_id: organisationId,
    formation_id: formationId,
    modality,
    start_date: startDate,
    end_date: endDate,
    distance_mode: modality === "distanciel" ? distanceMode : null,
    blended_elearning_periods: modality === "mixte" ? nullableText(body, "blended_elearning_periods") : null,
    blended_in_person_days: modality === "mixte" ? nullableText(body, "blended_in_person_days") : null,
    schedule_blocks: scheduleBlocks,
    location_address:
      modality === "presentiel" || modality === "mixte" ? nullableText(body, "location_address") : null,
    remote_url: modality === "distanciel" || modality === "mixte" ? nullableText(body, "remote_url") : null,
    companies: jsonArray(body.companies).map(companyRow).filter(Boolean),
    beneficiaries: jsonArray(body.beneficiaries).map(participantRow).filter(Boolean),
    individual_beneficiaries: jsonArray(body.individual_beneficiaries).map(participantRow).filter(Boolean),
    trainer_ids: jsonArray(body.trainer_ids).map(String).filter(Boolean),
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

async function refreshLearnerTier(organisationId: string, actingUserId: string, admin: ReturnType<typeof import("@/lib/server/clientNdaAccess").getAdminSupabase>) {
  const billingUserId = await getDailyOrganisationBillingUserId(organisationId, actingUserId);
  const { data: learnerCount, error } = await admin.rpc("daily_prepare_upper_tier_if_needed", {
    p_user_id: billingUserId,
  });
  if (error) return null;
  return learnerCount ?? null;
}

export async function GET(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions", { allowAssistanceRead: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

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

  const body = await req.json().catch(() => ({}));
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
  if (!formation) return NextResponse.json({ error: "Formation introuvable ou archivee." }, { status: 404 });

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
        ? "La session est prete a accueillir les inscriptions. Les documents officiels partiront quand le programme, le positionnement et l'evaluation auront ete valides."
        : null,
  });
}

export async function PATCH(req: Request) {
  if (getAssistanceTokenFromRequest(req)) return blockedAgentAssistanceResponse();
  const context = await getDailyOrganisationContext(req, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await req.json().catch(() => ({}));
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
  if (!formation) return NextResponse.json({ error: "Formation introuvable ou archivee." }, { status: 404 });

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

  const body = await req.json().catch(() => ({}));
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
