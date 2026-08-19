import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };
type SupportedPortalType = "enterprise" | "trainer";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function todayParis() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateValue: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function rating(value: unknown, required = false) {
  if (value === null || value === undefined || value === "") return required ? null : undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return null;
  return parsed;
}

function optionalText(value: unknown, max = 4000) {
  const normalized = clean(value);
  return normalized ? normalized.slice(0, max) : null;
}

function stakeholderTypeForPortal(portalType: SupportedPortalType) {
  return portalType === "enterprise" ? "company" : "trainer";
}

function availabilityOffsetForPortal(portalType: SupportedPortalType) {
  return portalType === "enterprise" ? 10 : 0;
}

function portalLabel(portalType: SupportedPortalType) {
  return portalType === "enterprise" ? "commanditaire" : "formateur";
}

async function resolveSatisfactionPortal(token: string) {
  const admin = getAdminSupabase();
  const { data: access, error: accessError } = await admin
    .from("daily_portal_access_tokens")
    .select("id,session_id,user_id,portal_type,entity_key,entity_name,entity_email,status,expires_at")
    .eq("token", token)
    .maybeSingle();

  if (accessError) return { error: accessError.message, status: 500 as const };
  if (!access) return { error: "Portail introuvable.", status: 404 as const };
  if (access.portal_type !== "enterprise" && access.portal_type !== "trainer") {
    return { error: "Ce questionnaire n’est pas disponible depuis ce portail.", status: 403 as const };
  }
  if (access.expires_at && new Date(access.expires_at).getTime() < Date.now()) {
    return { error: "Ce lien de portail a expiré.", status: 410 as const };
  }

  const portalType = access.portal_type as SupportedPortalType;
  const { data: session, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,internal_reference,end_date,status,daily_formations(title)")
    .eq("id", access.session_id)
    .neq("status", "archived")
    .maybeSingle();

  if (sessionError) return { error: sessionError.message, status: 500 as const };
  if (!session) return { error: "Session introuvable.", status: 404 as const };
  if (!session.end_date) return { error: "La date de fin de session n’est pas encore définie.", status: 409 as const };

  const availableFrom = addDays(session.end_date, availabilityOffsetForPortal(portalType));
  const isAvailable = Boolean(availableFrom && todayParis() >= availableFrom);
  return {
    admin,
    access,
    session,
    portalType,
    stakeholderType: stakeholderTypeForPortal(portalType),
    availableFrom,
    isAvailable,
  };
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const portal = await resolveSatisfactionPortal(clean(token));
  if ("error" in portal) return NextResponse.json({ error: portal.error }, { status: portal.status });

  const { data: response, error: responseError } = await portal.admin
    .from("daily_stakeholder_satisfaction_responses")
    .select("id,overall_rating,objectives_rating,trainer_rating,organisation_rating,would_recommend,strengths,improvements,free_comment,submitted_at")
    .eq("session_id", portal.session.id)
    .eq("stakeholder_type", portal.stakeholderType)
    .eq("entity_key", portal.access.entity_key)
    .maybeSingle();

  if (responseError) return NextResponse.json({ error: responseError.message }, { status: 500 });

  const formationRelation = portal.session.daily_formations;
  const formation = Array.isArray(formationRelation) ? formationRelation[0] : formationRelation;
  return NextResponse.json({
    available: portal.isAvailable,
    availableFrom: portal.availableFrom,
    alreadySubmitted: Boolean(response),
    response,
    portalType: portal.portalType,
    stakeholder: {
      name: portal.access.entity_name,
      email: portal.access.entity_email,
      label: portalLabel(portal.portalType),
    },
    session: {
      id: portal.session.id,
      reference: portal.session.internal_reference,
      endDate: portal.session.end_date,
      formationTitle: formation?.title ?? "Formation Daily",
    },
  });
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const portal = await resolveSatisfactionPortal(clean(token));
  if ("error" in portal) return NextResponse.json({ error: portal.error }, { status: portal.status });
  if (!portal.isAvailable) {
    const message = portal.portalType === "enterprise"
      ? "Le questionnaire commanditaire sera disponible 10 jours après la fin de la formation."
      : "Le questionnaire formateur sera disponible le dernier jour de la formation.";
    return NextResponse.json({ error: message, availableFrom: portal.availableFrom }, { status: 409 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Réponse invalide." }, { status: 400 });

  const overallRating = rating(body.overall_rating, true);
  const objectivesRating = rating(body.objectives_rating);
  const trainerRating = rating(body.trainer_rating);
  const organisationRating = rating(body.organisation_rating);
  if (
    overallRating === null ||
    objectivesRating === null ||
    trainerRating === null ||
    organisationRating === null
  ) {
    return NextResponse.json({ error: "Les notes doivent être comprises entre 1 et 5." }, { status: 400 });
  }

  const { data: existing, error: existingError } = await portal.admin
    .from("daily_stakeholder_satisfaction_responses")
    .select("id")
    .eq("session_id", portal.session.id)
    .eq("stakeholder_type", portal.stakeholderType)
    .eq("entity_key", portal.access.entity_key)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing) return NextResponse.json({ error: "Ce questionnaire a déjà été transmis." }, { status: 409 });

  const { data: inserted, error: insertError } = await portal.admin
    .from("daily_stakeholder_satisfaction_responses")
    .insert({
      organisation_id: portal.session.organisation_id,
      session_id: portal.session.id,
      stakeholder_type: portal.stakeholderType,
      entity_key: portal.access.entity_key,
      entity_name: clean(portal.access.entity_name) || null,
      entity_email: clean(portal.access.entity_email).toLowerCase() || null,
      overall_rating: overallRating,
      objectives_rating: objectivesRating ?? null,
      trainer_rating: trainerRating ?? null,
      organisation_rating: organisationRating ?? null,
      would_recommend: typeof body.would_recommend === "boolean" ? body.would_recommend : null,
      strengths: optionalText(body.strengths),
      improvements: optionalText(body.improvements),
      free_comment: optionalText(body.free_comment),
    })
    .select("id,submitted_at")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ ok: true, response: inserted }, { status: 201 });
}
