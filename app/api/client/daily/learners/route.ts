import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";

const enrolmentStatuses = new Set(["invited", "pending", "confirmed", "declined", "cancelled", "abandoned", "completed"]);
const fundingTypes = new Set(["employer", "self_funded", "opco", "public_funder", "other", "unknown"]);
const positioningStatuses = new Set(["not_started", "sent", "submitted", "reviewed"]);
const prerequisiteStatuses = new Set(["not_reviewed", "met", "not_met", "to_clarify"]);

function text(value: unknown) {
  const result = typeof value === "string" ? value.trim() : "";
  return result || null;
}

function normalizedEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function belongsToOrganisation(admin: any, table: string, id: string, organisationId: string) {
  const { data, error } = await admin.from(table).select("id").eq("id", id).eq("organisation_id", organisationId).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function GET(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions", { allowAssistanceRead: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const [{ data: learners, error: learnerError }, { data: enrolments, error: enrolmentError }, { data: needs, error: needsError }] = await Promise.all([
    context.admin.from("daily_learners").select("*").eq("organisation_id", context.organisationId).order("last_name").order("first_name"),
    context.admin.from("daily_session_enrolments").select("*,daily_learners(id,first_name,last_name,email,phone,company_name,job_title),daily_sessions(id,internal_reference,start_date,end_date,formation_id,daily_formations(title))").eq("organisation_id", context.organisationId).order("created_at", { ascending: false }),
    context.admin.from("daily_enrolment_support_needs").select("*").eq("organisation_id", context.organisationId),
  ]);
  const error = learnerError ?? enrolmentError ?? needsError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enrolmentRows = enrolments ?? [];
  const sessionIds = [...new Set(enrolmentRows.map((row) => String(row.session_id ?? "")).filter(Boolean))];
  let portalAccess: Array<Record<string, unknown>> = [];

  if (sessionIds.length > 0) {
    const { data: portalRows, error: portalError } = await context.admin
      .from("daily_portal_access_tokens")
      .select("id,session_id,portal_type,entity_key,entity_name,entity_email,token,status,expires_at,last_viewed_at")
      .in("session_id", sessionIds)
      .eq("portal_type", "learner")
      .not("status", "eq", "expired");
    if (portalError) return NextResponse.json({ error: portalError.message }, { status: 500 });

    portalAccess = enrolmentRows.flatMap((enrolment) => {
      const learner = enrolment.daily_learners as { email?: string | null; first_name?: string | null; last_name?: string | null } | null;
      const learnerEmail = normalizedEmail(learner?.email);
      const learnerName = [learner?.first_name, learner?.last_name].map((part) => String(part ?? "").trim()).filter(Boolean).join(" ").toLowerCase();
      const access = (portalRows ?? []).find((row) => {
        if (row.session_id !== enrolment.session_id) return false;
        const portalEmail = normalizedEmail(row.entity_email);
        const portalName = String(row.entity_name ?? "").trim().toLowerCase();
        return Boolean((learnerEmail && portalEmail === learnerEmail) || (learnerName && portalName === learnerName));
      });
      return access ? [{ ...access, enrolment_id: enrolment.id, learner_id: enrolment.learner_id }] : [];
    });
  }

  return NextResponse.json({ learners: learners ?? [], enrolments: enrolmentRows, supportNeeds: needs ?? [], portalAccess });
}

export async function POST(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.assisted) return NextResponse.json({ error: "L’assistance agent est en lecture seule." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "learner") {
    const firstName = text(body.first_name);
    const lastName = text(body.last_name);
    if (!firstName || !lastName) return NextResponse.json({ error: "Prénom et nom sont obligatoires." }, { status: 400 });
    const { data, error } = await context.admin.from("daily_learners").insert({
      organisation_id: context.organisationId,
      first_name: firstName,
      last_name: lastName,
      email: text(body.email),
      phone: text(body.phone),
      company_name: text(body.company_name),
      job_title: text(body.job_title),
      created_by: context.user.id,
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.code === "23505" ? "Un apprenant avec cet email existe déjà dans votre organisme." : error.message }, { status: 400 });
    return NextResponse.json({ learner: data });
  }

  if (action === "enrolment") {
    const sessionId = String(body.session_id ?? "");
    const learnerId = String(body.learner_id ?? "");
    if (!sessionId || !learnerId) return NextResponse.json({ error: "Session et apprenant sont obligatoires." }, { status: 400 });
    try {
      const [sessionOwned, learnerOwned] = await Promise.all([
        belongsToOrganisation(context.admin, "daily_sessions", sessionId, context.organisationId),
        belongsToOrganisation(context.admin, "daily_learners", learnerId, context.organisationId),
      ]);
      if (!sessionOwned || !learnerOwned) return NextResponse.json({ error: "Session ou apprenant introuvable dans votre organisme." }, { status: 404 });
    } catch (cause) {
      return NextResponse.json({ error: cause instanceof Error ? cause.message : "Vérification impossible." }, { status: 500 });
    }
    const status = enrolmentStatuses.has(String(body.status)) ? String(body.status) : "pending";
    const fundingType = fundingTypes.has(String(body.funding_type)) ? String(body.funding_type) : "unknown";
    const { data, error } = await context.admin.from("daily_session_enrolments").insert({
      organisation_id: context.organisationId,
      session_id: sessionId,
      learner_id: learnerId,
      status,
      funding_type: fundingType,
      funding_organisation: text(body.funding_organisation),
      company_name: text(body.company_name),
      company_contact_name: text(body.company_contact_name),
      company_contact_email: text(body.company_contact_email),
      created_by: context.user.id,
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.code === "23505" ? "Cet apprenant est déjà inscrit à cette session." : error.message }, { status: 400 });
    return NextResponse.json({ enrolment: data });
  }

  if (action === "support") {
    const enrolmentId = String(body.enrolment_id ?? "");
    if (!enrolmentId) return NextResponse.json({ error: "Inscription manquante." }, { status: 400 });
    try {
      const enrolmentOwned = await belongsToOrganisation(context.admin, "daily_session_enrolments", enrolmentId, context.organisationId);
      if (!enrolmentOwned) return NextResponse.json({ error: "Inscription introuvable dans votre organisme." }, { status: 404 });
    } catch (cause) {
      return NextResponse.json({ error: cause instanceof Error ? cause.message : "Vérification impossible." }, { status: 500 });
    }
    const hasSpecificNeeds = Boolean(body.has_specific_needs);
    const payload = {
      enrolment_id: enrolmentId,
      organisation_id: context.organisationId,
      has_specific_needs: hasSpecificNeeds,
      needs_description: hasSpecificNeeds ? text(body.needs_description) : null,
      planned_accommodations: hasSpecificNeeds ? text(body.planned_accommodations) : null,
      contact_requested: hasSpecificNeeds ? Boolean(body.contact_requested) : false,
    };
    const { data, error } = await context.admin.from("daily_enrolment_support_needs").upsert(payload, { onConflict: "enrolment_id" }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ supportNeed: data });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}

export async function PATCH(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.assisted) return NextResponse.json({ error: "L’assistance agent est en lecture seule." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "Inscription manquante." }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (enrolmentStatuses.has(String(body.status))) updates.status = String(body.status);
  if (fundingTypes.has(String(body.funding_type))) updates.funding_type = String(body.funding_type);
  if (positioningStatuses.has(String(body.positioning_status))) updates.positioning_status = String(body.positioning_status);
  if (prerequisiteStatuses.has(String(body.prerequisites_status))) updates.prerequisites_status = String(body.prerequisites_status);
  if ("funding_organisation" in body) updates.funding_organisation = text(body.funding_organisation);
  const { data, error } = await context.admin.from("daily_session_enrolments").update(updates).eq("id", id).eq("organisation_id", context.organisationId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ enrolment: data });
}

export async function DELETE(req: Request) {
  const context = await getDailyOrganisationContext(req, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.assisted) return NextResponse.json({ error: "L’assistance agent est en lecture seule." }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Inscription manquante." }, { status: 400 });
  const { error } = await context.admin.from("daily_session_enrolments").delete().eq("id", id).eq("organisation_id", context.organisationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
