import { personalSignatureStorageObjectPath } from "@/lib/server/dailyPersonalAttendance";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { matchesDailyLearnerPortalAccess, hasUniqueDailyLearnerRecipientEmail } from "@/lib/server/dailyPortalLearnerIdentity";
import { resolveEnterprisePortalCompany } from "@/lib/daily/enterprisePortalIdentity.mjs";
import { isValidPortalExpiry } from "@/lib/daily/portalAttendanceAccess.mjs";

const portalJson = (body: unknown, init: { status?: number } = {}) => NextResponse.json(body, { ...init, headers: { "Cache-Control": "private, no-store" } });
const portalReadFailure = () => portalJson({ error: "Les documents sont temporairement indisponibles. Réessayez." }, { status: 503 });
type Params = { params: Promise<{ token: string }> };

function clean(value?: string | null) {
  return String(value ?? "").trim();
}

function normalizedEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  const cleanToken = clean(token);
  const convocationId = clean(new URL(request.url).searchParams.get("id"));
  if (!cleanToken || !convocationId) return portalJson({ error: "Lien invalide." }, { status: 400 });

  const supabase = getAdminSupabase();
  const { data: access, error: accessError } = await supabase
    .from("daily_portal_access_tokens")
    .select("*")
    .eq("token", cleanToken)
    .maybeSingle();
  if (accessError) return portalReadFailure();
  if (!access || !isValidPortalExpiry(access.expires_at)) {
    return portalJson({ error: "Portail introuvable ou expire." }, { status: 404 });
  }
  if (!["pending", "viewed"].includes(String(access.status ?? ""))) {
    return portalJson({ error: "Cet accès n’est plus actif." }, { status: 403 });
  }
  if (!["learner", "enterprise", "trainer"].includes(String(access.portal_type ?? ""))) {
    return portalJson({ error: "Rôle de portail non autorisé." }, { status: 403 });
  }
  const { data: session, error: sessionError } = await supabase.from("daily_sessions")
    .select("id,organisation_id,companies")
    .eq("id", access.session_id).neq("status", "archived").maybeSingle();
  if (sessionError) return portalReadFailure();
  if (!session) return portalJson({ error: "Session introuvable." }, { status: 404 });

  const { data: convocation, error } = await supabase
    .from("daily_convocations")
    .select("id,recipient_type,recipient_name,recipient_email,company_name,document_name,storage_path")
    .eq("id", convocationId)
    .eq("session_id", access.session_id)
    .maybeSingle();
  if (error) return portalReadFailure();
  if (!convocation?.storage_path) return portalJson({ error: "Convocation introuvable." }, { status: 404 });

  const entityEmail = normalizedEmail(access.entity_email);
  if (access.portal_type === "learner") {
    const { data: rows, error: enrolmentError } = await supabase.from("daily_session_enrolments")
      .select("learner_id,status,daily_learners(email,first_name,last_name)")
      .eq("session_id", access.session_id)
      ;
    if (enrolmentError) return portalReadFailure();
    const matches = (rows ?? []).filter((row) => !["declined", "cancelled", "abandoned"].includes(String(row.status ?? "")) && matchesDailyLearnerPortalAccess(access, row));
    if (matches.length !== 1) return portalJson({ error: "Accès apprenant absent ou ambigu." }, { status: matches.length ? 409 : 403 });
    if (!hasUniqueDailyLearnerRecipientEmail(access, rows ?? [])) return portalJson({ error: "Document à destinataire email ambigu." }, { status: 403 });
  }
  if (access.portal_type === "enterprise") {
    const companyIdentity = resolveEnterprisePortalCompany(Array.isArray(session?.companies) ? session.companies : [], entityEmail);
    if (companyIdentity.status !== "ok") return portalJson({ error: "Identité entreprise absente ou ambiguë." }, { status: companyIdentity.status === "ambiguous" ? 409 : 403 });
  }
  const allowed =
    (access.portal_type === "learner" &&
      convocation.recipient_type === "beneficiary" &&
      Boolean(entityEmail && normalizedEmail(convocation.recipient_email) === entityEmail)) ||
    (access.portal_type === "enterprise" &&
      convocation.recipient_type === "company" &&
      Boolean(entityEmail && normalizedEmail(convocation.recipient_email) === entityEmail)) ||
    (access.portal_type === "trainer" && convocation.recipient_type === "trainer" && Boolean(entityEmail && normalizedEmail(convocation.recipient_email) === entityEmail));
  if (!allowed) return portalJson({ error: "Document non disponible pour ce portail." }, { status: 403 });

  const storagePath = personalSignatureStorageObjectPath(convocation.storage_path, session.organisation_id);
  if (!storagePath) return portalJson({ error: "Document introuvable." }, { status: 404 });

  const { data, error: signedUrlError } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, 120, {
      download: convocation.document_name ?? true,
    });
  if (signedUrlError || !data?.signedUrl) {
    return portalReadFailure();
  }

  const { error: viewedError } = await supabase.from("daily_convocations").update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", convocation.id).eq("status", "sent");
  if (viewedError) return portalReadFailure();
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
