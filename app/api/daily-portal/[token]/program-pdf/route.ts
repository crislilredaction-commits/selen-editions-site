import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { renderRegistrationProgramPdf } from "@/lib/server/dailyRegistrationProgramPdf";

type Params = { params: Promise<{ token: string }> };
const text = (v: unknown) => String(v ?? "").trim();
const email = (v: unknown) => text(v).toLowerCase();
const related = (v: any) => Array.isArray(v) ? v[0] : v;
const safe = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 80) || "formation";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: Params) {
  const token = text((await params).token);
  if (!token) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  try {
    const admin = getAdminSupabase();
    const { data: access, error: accessError } = await admin.from("daily_portal_access_tokens")
      .select("session_id,portal_type,entity_key,entity_email,status,expires_at")
      .eq("token", token).maybeSingle();
    if (accessError) throw accessError;
    if (!access || access.portal_type !== "learner") return NextResponse.json({ error: "Programme introuvable." }, { status: 404 });
    if (["revoked", "expired"].includes(access.status) || (access.expires_at && new Date(access.expires_at).getTime() <= Date.now()))
      return NextResponse.json({ error: "Accès expiré ou révoqué." }, { status: 403 });
    const { data: session, error: sessionError } = await admin.from("daily_sessions")
      .select("id,organisation_id,formation_id,user_id,status").eq("id", access.session_id).neq("status", "archived").maybeSingle();
    if (sessionError) throw sessionError;
    if (!session?.formation_id || !session.organisation_id) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
    const { data: enrolments, error: enrolmentError } = await admin.from("daily_session_enrolments")
      .select("learner_id,daily_learners(email)").eq("session_id", session.id).eq("organisation_id", session.organisation_id)
      .not("status", "in", "(declined,cancelled,abandoned)");
    if (enrolmentError) throw enrolmentError;
    const entityKey = text(access.entity_key);
    const entityEmail = email(access.entity_email);
    const matched = (enrolments ?? []).some((row: any) =>
      entityKey ? entityKey === `learner:${row.learner_id}` :
      Boolean(entityEmail && entityEmail === email(related(row.daily_learners)?.email)));
    if (!matched) return NextResponse.json({ error: "Inscription inactive." }, { status: 403 });
    const { data: formation, error: formationError } = await admin.from("daily_formations")
      .select("id,user_id,title,status,creation_mode,global_objective,learning_objectives,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,detailed_program,accessibility,pedagogical_resources,pedagogical_methods,evaluation_methods,contact_phone,contact_email,contact_website")
      .eq("id", session.formation_id).eq("organisation_id", session.organisation_id).maybeSingle();
    if (formationError) throw formationError;
    if (!formation || formation.status !== "validated" || (formation.creation_mode ?? "selen_form") !== "selen_form")
      return NextResponse.json({ error: "Programme indisponible." }, { status: 404 });
    const { data: organisation, error: organisationError } = await admin.from("daily_onboarding")
      .select("organisation_name,address,platform_contact_email").eq("user_id", session.user_id).maybeSingle();
    if (organisationError) throw organisationError;
    const bytes = renderRegistrationProgramPdf(formation, organisation);
    return new Response(bytes, { status: 200, headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="programme-${safe(text(formation.title))}.pdf"`,
      "Cache-Control": "private, no-store",
    } });
  } catch {
    return NextResponse.json({ error: "Impossible de générer le programme." }, { status: 500 });
  }
}
