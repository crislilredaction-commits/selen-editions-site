import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

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

function isExpired(expiresAt?: string | null) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
}

async function loadAccess(rawToken: string) {
  const admin = getAdminSupabase();
  const { data: access, error } = await admin
    .from("daily_portal_access_tokens")
    .select("id,user_id,organisation_id,session_id,portal_type,entity_name,entity_email,status,expires_at")
    .eq("token", rawToken)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return access ? { admin, access } : null;
}

async function learnerEnrolmentId(
  admin: ReturnType<typeof getAdminSupabase>,
  access: JsonRecord,
) {
  if (access.portal_type !== "learner") return null;
  const email = clean(access.entity_email, 320).toLowerCase();
  if (!email) return null;

  const { data, error } = await admin
    .from("daily_session_enrolments")
    .select("id,daily_learners(email)")
    .eq("organisation_id", access.organisation_id)
    .eq("session_id", access.session_id)
    .not("status", "in", "(declined,cancelled)");
  if (error) throw new Error(error.message);

  const row = (data ?? []).find((item) => {
    const learner = Array.isArray(item.daily_learners) ? item.daily_learners[0] : item.daily_learners;
    return clean(learner?.email, 320).toLowerCase() === email;
  });
  return row?.id ?? null;
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const rawToken = clean(token, 512);
  if (!rawToken) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  try {
    const loaded = await loadAccess(rawToken);
    if (!loaded) return NextResponse.json({ error: "Portail introuvable." }, { status: 404 });
    const { access } = loaded;
    if (isExpired(access.expires_at) || access.status === "expired") {
      return NextResponse.json({ error: "Ce lien de portail a expiré." }, { status: 410 });
    }

    return NextResponse.json({
      stakeholderType: stakeholderType(access.portal_type),
      submitterName: clean(access.entity_name, 200),
      submitterEmail: clean(access.entity_email, 320),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ouverture impossible." }, { status: 500 });
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
  if (!['complaint', 'suggestion'].includes(submissionType)) {
    return NextResponse.json({ error: "Choisissez réclamation ou suggestion." }, { status: 400 });
  }
  if (!subject || !message) {
    return NextResponse.json({ error: "L'objet et le message sont obligatoires." }, { status: 400 });
  }

  try {
    const loaded = await loadAccess(rawToken);
    if (!loaded) return NextResponse.json({ error: "Portail introuvable." }, { status: 404 });
    const { admin, access } = loaded;
    if (isExpired(access.expires_at) || access.status === "expired") {
      return NextResponse.json({ error: "Ce lien de portail a expiré." }, { status: 410 });
    }

    const enrolmentId = await learnerEnrolmentId(admin, access as JsonRecord);
    const { data, error } = await admin
      .from("daily_stakeholder_feedback")
      .insert({
        organisation_id: access.organisation_id,
        session_id: access.session_id,
        enrolment_id: enrolmentId,
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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, reference: data.id, submittedAt: data.created_at, status: data.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Enregistrement impossible." }, { status: 500 });
  }
}
