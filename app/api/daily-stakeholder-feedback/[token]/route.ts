import { NextResponse } from "next/server";
import { isActivePortalAttendanceToken } from "@/lib/daily/portalAttendanceAccess.mjs";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { findUniqueDailyLearnerPortalEnrolment } from "@/lib/server/dailyPortalLearnerIdentity";

type Params = { params: Promise<{ token: string }> };
type JsonRecord = Record<string, unknown>;

function clean(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function stakeholderType(portalType: unknown) {
  if (portalType === "learner") return "learner";
  if (portalType === "trainer") return "trainer";
  if (portalType === "enterprise") return "company";
  return "other";
}

function portalAccessError(access: JsonRecord) {
  if (!["learner", "trainer", "enterprise"].includes(String(access.portal_type ?? ""))) {
    return { error: "Rôle de portail non autorisé.", status: 403 };
  }
  if (access.status === "expired") {
    return { error: "Ce lien de portail a expiré.", status: 410 };
  }
  if (!["pending", "viewed"].includes(String(access.status ?? ""))) {
    return { error: "Cet accès n’est plus actif.", status: 403 };
  }
  // Null deadlines remain valid for legacy links; malformed or elapsed dates fail closed.
  if (!isActivePortalAttendanceToken(access.status, access.expires_at)) {
    return { error: "Ce lien de portail a expiré.", status: 410 };
  }
  return null;
}

async function loadAccess(rawToken: string) {
  const admin = getAdminSupabase();
  const { data: access, error } = await admin
    .from("daily_portal_access_tokens")
    .select("id,user_id,session_id,portal_type,entity_key,entity_name,entity_email,status,expires_at")
    .eq("token", rawToken)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!access) return null;

  const { data: session, error: sessionError } = await admin
    .from("daily_sessions")
    .select("organisation_id,status")
    .eq("id", access.session_id)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session?.organisation_id || session.status === "archived") return null;

  return { admin, access: { ...access, organisation_id: session.organisation_id } };
}

async function learnerEnrolmentId(
  admin: ReturnType<typeof getAdminSupabase>,
  access: JsonRecord,
) {
  if (access.portal_type !== "learner") return { id: null };

  // Resolve against ALL enrolments, including cancelled ones, before checking activity.
  // A legacy email-only link must never switch to another learner after withdrawal.
  const { data, error } = await admin
    .from("daily_session_enrolments")
    .select("id,learner_id,status,daily_learners(id,email)")
    .eq("organisation_id", access.organisation_id)
    .eq("session_id", access.session_id);
  if (error) throw new Error(error.message);

  const enrolment = findUniqueDailyLearnerPortalEnrolment(access, data ?? []);
  if (!enrolment) {
    return { error: "Identité apprenant introuvable ou ambiguë.", status: 409 };
  }
  if (["declined", "cancelled", "abandoned"].includes(String(enrolment.status ?? ""))) {
    return { error: "Cette inscription n’est plus active.", status: 403 };
  }
  return { id: enrolment.id };
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const rawToken = clean(token, 512);
  if (!rawToken) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  try {
    const loaded = await loadAccess(rawToken);
    if (!loaded) return NextResponse.json({ error: "Portail introuvable." }, { status: 404 });
    const { admin, access } = loaded;
    const accessProblem = portalAccessError(access);
    if (accessProblem) return NextResponse.json({ error: accessProblem.error }, { status: accessProblem.status });
    const identity = await learnerEnrolmentId(admin, access as JsonRecord);
    if ("error" in identity) return NextResponse.json({ error: identity.error }, { status: identity.status });

    return NextResponse.json({
      stakeholderType: stakeholderType(access.portal_type),
      submitterName: clean(access.entity_name, 200),
      submitterEmail: clean(access.entity_email, 320),
    });
  } catch {
    return NextResponse.json({ error: "Ouverture du formulaire temporairement indisponible." }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const rawToken = clean(token, 512);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!rawToken) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const submissionType = clean(body.submissionType, 20);
  const subject = clean(body.subject, 200);
  const message = clean(body.message, 6000);
  if (!["complaint", "suggestion"].includes(submissionType)) {
    return NextResponse.json({ error: "Choisissez réclamation ou suggestion." }, { status: 400 });
  }
  if (!subject || !message) {
    return NextResponse.json({ error: "L'objet et le message sont obligatoires." }, { status: 400 });
  }

  try {
    const loaded = await loadAccess(rawToken);
    if (!loaded) return NextResponse.json({ error: "Portail introuvable." }, { status: 404 });
    const { admin, access } = loaded;
    const accessProblem = portalAccessError(access);
    if (accessProblem) return NextResponse.json({ error: accessProblem.error }, { status: accessProblem.status });
    const identity = await learnerEnrolmentId(admin, access as JsonRecord);
    if ("error" in identity) return NextResponse.json({ error: identity.error }, { status: identity.status });
    const { data, error } = await admin
      .from("daily_stakeholder_feedback")
      .insert({
        organisation_id: access.organisation_id,
        session_id: access.session_id,
        enrolment_id: identity.id,
        submission_type: submissionType,
        stakeholder_type: stakeholderType(access.portal_type),
        submitter_name: clean(access.entity_name, 200) || "Partie prenante Daily",
        submitter_email: clean(access.entity_email, 320) || null,
        subject,
        message,
        status: "received",
      })
      .select("id,created_at,status")
      .single();

    if (error) return NextResponse.json({ error: "Enregistrement temporairement indisponible." }, { status: 503 });
    return NextResponse.json({ ok: true, reference: data.id, submittedAt: data.created_at, status: data.status });
  } catch {
    return NextResponse.json({ error: "Enregistrement temporairement indisponible." }, { status: 503 });
  }
}
