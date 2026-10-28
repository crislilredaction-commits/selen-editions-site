import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { matchesDailyLearnerPortalAccess, hasUniqueDailyLearnerRecipientEmail } from "@/lib/server/dailyPortalLearnerIdentity";
import { resolveEnterprisePortalCompany } from "@/lib/daily/enterprisePortalIdentity.mjs";

type Params = { params: Promise<{ token: string }> };

function clean(value?: string | null) {
  return String(value ?? "").trim();
}

function normalizedEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isExpired(expiresAt?: string | null) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
}

export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  const cleanToken = clean(token);
  const conventionId = clean(new URL(request.url).searchParams.get("id"));
  if (!cleanToken || !conventionId) {
    return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  }

  const supabase = getAdminSupabase();
  const { data: access, error: accessError } = await supabase
    .from("daily_portal_access_tokens")
    .select("*")
    .eq("token", cleanToken)
    .maybeSingle();

  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 500 });
  if (!access || isExpired(access.expires_at)) {
    return NextResponse.json({ error: "Portail introuvable ou expire." }, { status: 404 });
  }
  if (["revoked", "expired"].includes(String(access.status ?? ""))) {
    return NextResponse.json({ error: "Cet accès n’est plus actif." }, { status: 403 });
  }

  const { data: convention, error } = await supabase
    .from("daily_conventions")
    .select("id,recipient_type,recipient_name,recipient_email,company_name,document_name,storage_path")
    .eq("id", conventionId)
    .eq("session_id", access.session_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!convention?.storage_path) {
    return NextResponse.json({ error: "Convention introuvable." }, { status: 404 });
  }

  const entityEmail = normalizedEmail(access.entity_email);
  if (access.portal_type === "learner") {
    const { data: rows, error: enrolmentError } = await supabase.from("daily_session_enrolments")
      .select("learner_id,status,daily_learners(email,first_name,last_name)")
      .eq("session_id", access.session_id)
      ;
    if (enrolmentError) return NextResponse.json({ error: enrolmentError.message }, { status: 500 });
    const matches = (rows ?? []).filter((row) => !["declined", "cancelled", "abandoned"].includes(String(row.status ?? "")) && matchesDailyLearnerPortalAccess(access, row));
    if (matches.length !== 1) return NextResponse.json({ error: "Accès apprenant absent ou ambigu." }, { status: matches.length ? 409 : 403 });
    if (!hasUniqueDailyLearnerRecipientEmail(access, rows ?? [])) return NextResponse.json({ error: "Document à destinataire email ambigu." }, { status: 403 });
  }
  if (access.portal_type === "enterprise") {
    const { data: session, error: sessionError } = await supabase.from("daily_sessions")
      .select("companies").eq("id", access.session_id).neq("status", "archived").maybeSingle();
    if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
    const companyIdentity = resolveEnterprisePortalCompany(Array.isArray(session?.companies) ? session.companies : [], entityEmail);
    if (companyIdentity.status !== "ok") return NextResponse.json({ error: "Identité entreprise absente ou ambiguë." }, { status: companyIdentity.status === "ambiguous" ? 409 : 403 });
  }
  const allowed =
    (access.portal_type === "learner" &&
      convention.recipient_type === "beneficiary" &&
      Boolean(entityEmail && normalizedEmail(convention.recipient_email) === entityEmail)) ||
    (access.portal_type === "enterprise" &&
      convention.recipient_type === "company" &&
      Boolean(entityEmail && normalizedEmail(convention.recipient_email) === entityEmail));

  if (!allowed) return NextResponse.json({ error: "Document non disponible pour ce portail." }, { status: 403 });

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("documents")
    .createSignedUrl(convention.storage_path, 60 * 5, {
      download: convention.document_name ?? true,
    });

  if (signedUrlError || !signedUrlData?.signedUrl) {
    return NextResponse.json(
      { error: signedUrlError?.message ?? "Impossible de generer le lien de telechargement." },
      { status: 500 },
    );
  }

  return NextResponse.redirect(signedUrlData.signedUrl);
}
