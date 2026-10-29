import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { renderRegistrationProgramPdf } from "@/lib/server/dailyRegistrationProgramPdf";
import { positioningSourceDocumentId } from "@/lib/daily/ownPositioning";
import { findUniqueDailyLearnerPortalEnrolment } from "@/lib/server/dailyPortalLearnerIdentity";
import { personalSignatureStorageObjectPath } from "@/lib/server/dailyPersonalAttendance";

type Params = { params: Promise<{ token: string }> };
const text = (v: unknown) => String(v ?? "").trim();
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
    if (!["pending", "viewed"].includes(String(access.status ?? "")) || (access.expires_at && new Date(access.expires_at).getTime() <= Date.now()))
      return NextResponse.json({ error: "Accès expiré ou révoqué." }, { status: 403 });
    const { data: session, error: sessionError } = await admin.from("daily_sessions")
      .select("id,organisation_id,formation_id,user_id,status").eq("id", access.session_id).neq("status", "archived").maybeSingle();
    if (sessionError) throw sessionError;
    if (!session?.formation_id || !session.organisation_id) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
    const { data: enrolments, error: enrolmentError } = await admin.from("daily_session_enrolments")
      .select("learner_id,status,daily_learners(email)").eq("session_id", session.id).eq("organisation_id", session.organisation_id);
    if (enrolmentError) throw enrolmentError;
    const matched = findUniqueDailyLearnerPortalEnrolment(access, enrolments ?? []);
    if (!matched || ["declined", "cancelled", "abandoned"].includes(String(matched.status ?? "")))
      return NextResponse.json({ error: "Inscription inactive ou identité ambiguë." }, { status: 403 });
    const { data: formation, error: formationError } = await admin.from("daily_formations")
      .select("id,user_id,title,status,creation_mode,global_objective,learning_objectives,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,detailed_program,accessibility,pedagogical_resources,pedagogical_methods,evaluation_methods,contact_phone,contact_email,contact_website,detailed_program_document_url")
      .eq("id", session.formation_id).eq("organisation_id", session.organisation_id).maybeSingle();
    if (formationError) throw formationError;
    if (!formation || formation.status !== "validated")
      return NextResponse.json({ error: "Programme indisponible." }, { status: 404 });
    if (formation.creation_mode === "program_import") {
      const sourceId = positioningSourceDocumentId(formation.detailed_program_document_url);
      if (!sourceId) return NextResponse.json({ error: "Programme importé indisponible." }, { status: 404 });
      const { data: source, error: sourceError } = await admin.from("daily_documents")
        .select("id,bucket,storage_path,is_current,status,archived_at,document_type,linked_object_type,linked_object_id,formation_id")
        .eq("id", sourceId).eq("organisation_id", session.organisation_id)
        .eq("document_type", "training_program_source")
        .eq("linked_object_type", "organisation").eq("linked_object_id", session.organisation_id)
        .maybeSingle();
      if (sourceError) throw sourceError;
      const storagePath = personalSignatureStorageObjectPath(source?.storage_path, session.organisation_id);
      if (!source || !source.is_current || source.archived_at || source.status === "archived"
        || (source.formation_id && source.formation_id !== formation.id)
        || source.bucket !== "documents" || !storagePath)
        return NextResponse.json({ error: "Programme importé indisponible." }, { status: 404 });
      const { data: signed, error: signError } = await admin.storage.from("documents").createSignedUrl(storagePath, 120, { download: true });
      if (signError || !signed?.signedUrl) return NextResponse.json({ error: "Téléchargement indisponible." }, { status: 500 });
      return NextResponse.redirect(signed.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
    }
    if ((formation.creation_mode ?? "selen_form") !== "selen_form")
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
