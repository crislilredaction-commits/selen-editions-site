import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };
type PortalType = "enterprise" | "trainer";
type StakeholderType = "company" | "trainer";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function todayInParis() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function rating(value: unknown, required = false) {
  if (value === null || value === undefined || value === "") return required ? null : undefined;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

function booleanValue(value: unknown) {
  if (value === true || value === false) return value;
  return undefined;
}

function stakeholderType(portalType: PortalType): StakeholderType {
  return portalType === "enterprise" ? "company" : "trainer";
}

function dueDate(portalType: PortalType, endDate: string) {
  return portalType === "enterprise" ? addDays(endDate, 10) : endDate;
}

async function loadContext(token: string) {
  const supabase = getAdminSupabase();
  const { data: access, error: accessError } = await supabase
    .from("daily_portal_access_tokens")
    .select("id,session_id,portal_type,entity_key,entity_name,entity_email,status,expires_at")
    .eq("token", token)
    .maybeSingle();

  if (accessError) return { error: accessError.message, status: 500 as const };
  if (!access) return { error: "Lien de satisfaction introuvable.", status: 404 as const };
  if (access.portal_type !== "enterprise" && access.portal_type !== "trainer") {
    return { error: "Ce questionnaire n'est pas disponible depuis ce portail.", status: 403 as const };
  }
  if (access.status === "expired" || (access.expires_at && new Date(access.expires_at).getTime() < Date.now())) {
    return { error: "Ce lien a expiré.", status: 410 as const };
  }

  const { data: session, error: sessionError } = await supabase
    .from("daily_sessions")
    .select("id,organisation_id,end_date,status,daily_formations(title)")
    .eq("id", access.session_id)
    .maybeSingle();

  if (sessionError) return { error: sessionError.message, status: 500 as const };
  if (!session || session.status === "archived") return { error: "Session introuvable.", status: 404 as const };
  if (!session.end_date) return { error: "La date de fin de session n'est pas encore définie.", status: 409 as const };

  const type = stakeholderType(access.portal_type as PortalType);
  const due = dueDate(access.portal_type as PortalType, session.end_date);
  const { data: response, error: responseError } = await supabase
    .from("daily_stakeholder_satisfaction_responses")
    .select("id,submitted_at")
    .eq("session_id", session.id)
    .eq("stakeholder_type", type)
    .eq("entity_key", access.entity_key)
    .maybeSingle();

  if (responseError) return { error: responseError.message, status: 500 as const };

  const formationRelation = session.daily_formations as { title?: string | null } | { title?: string | null }[] | null;
  const formation = Array.isArray(formationRelation) ? formationRelation[0] : formationRelation;

  return {
    supabase,
    access,
    session,
    stakeholderType: type,
    dueDate: due,
    response,
    formationTitle: clean(formation?.title) || "votre formation",
  };
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const cleanToken = clean(token);
  if (!cleanToken) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const context = await loadContext(cleanToken);
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

  return NextResponse.json({
    stakeholderType: context.stakeholderType,
    entityName: context.access.entity_name,
    entityEmail: context.access.entity_email,
    formationTitle: context.formationTitle,
    dueDate: context.dueDate,
    isDue: todayInParis() >= context.dueDate,
    completed: Boolean(context.response),
    submittedAt: context.response?.submitted_at ?? null,
  });
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const cleanToken = clean(token);
  if (!cleanToken) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const context = await loadContext(cleanToken);
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.response) return NextResponse.json({ ok: true, alreadyCompleted: true, submittedAt: context.response.submitted_at });
  if (todayInParis() < context.dueDate) {
    return NextResponse.json({ error: `Ce questionnaire sera disponible à partir du ${context.dueDate}.` }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const overallRating = rating(body.overall_rating, true);
  const objectivesRating = rating(body.objectives_rating);
  const trainerRating = rating(body.trainer_rating);
  const organisationRating = rating(body.organisation_rating);

  if (overallRating === null || objectivesRating === null || trainerRating === null || organisationRating === null) {
    return NextResponse.json({ error: "Les notes doivent être comprises entre 1 et 5." }, { status: 400 });
  }

  const payload = {
    organisation_id: context.session.organisation_id,
    session_id: context.session.id,
    stakeholder_type: context.stakeholderType,
    entity_key: context.access.entity_key,
    entity_name: clean(context.access.entity_name) || null,
    entity_email: normalizedEmail(context.access.entity_email) || null,
    overall_rating: overallRating,
    objectives_rating: objectivesRating ?? null,
    trainer_rating: trainerRating ?? null,
    organisation_rating: organisationRating ?? null,
    would_recommend: booleanValue(body.would_recommend) ?? null,
    strengths: clean(body.strengths) || null,
    improvements: clean(body.improvements) || null,
    free_comment: clean(body.free_comment) || null,
  };

  const { data, error } = await context.supabase
    .from("daily_stakeholder_satisfaction_responses")
    .insert(payload)
    .select("id,submitted_at")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: true, alreadyCompleted: true });
    return NextResponse.json({ error: "Impossible d'enregistrer votre réponse pour le moment." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, response: data });
}
