import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };
type Json = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
const email = (value: unknown) => text(value).toLowerCase();
const array = (value: unknown): Json[] => Array.isArray(value) ? value.filter((v): v is Json => Boolean(v && typeof v === "object")) : [];
const published = ["validated", "published", "signed", "active"];
const learnerTypes = ["training_program", "convocation", "registration_positioning", "completion_certificate", "organisation_shared"];

function matchesLearnerRecipient(row: Json, access: Json) {
  const entityEmail = email(access.entity_email);
  const entityName = text(access.entity_name).toLowerCase();
  return row.recipient_type === "beneficiary" && (
    (entityEmail && email(row.recipient_email) === entityEmail)
    || (entityName && text(row.recipient_name).toLowerCase() === entityName)
  );
}

function latestVersion(rows: Json[]) {
  return [...rows].sort((a, b) => {
    const versionDelta = Number(b.version ?? 0) - Number(a.version ?? 0);
    if (versionDelta) return versionDelta;
    return new Date(text(b.generated_at) || 0).getTime() - new Date(text(a.generated_at) || 0).getTime();
  })[0] ?? null;
}

async function loadLearnerPretrainingResources(admin: ReturnType<typeof getAdminSupabase>, sessionId: string, access: Json) {
  if (access.portal_type !== "learner") return [] as Json[];

  const [conventionsResult, convocationsResult] = await Promise.all([
    admin
      .from("daily_conventions")
      .select("id,recipient_type,recipient_name,recipient_email,version,document_name,generated_at,storage_path")
      .eq("session_id", sessionId)
      .eq("recipient_type", "beneficiary"),
    admin
      .from("daily_convocations")
      .select("id,recipient_type,recipient_name,recipient_email,version,document_name,status,generated_at,storage_path")
      .eq("session_id", sessionId)
      .eq("recipient_type", "beneficiary"),
  ]);

  if (conventionsResult.error) throw conventionsResult.error;
  if (convocationsResult.error) throw convocationsResult.error;

  const convention = latestVersion((conventionsResult.data ?? []).filter((row: Json) => matchesLearnerRecipient(row, access) && text(row.storage_path)));
  const convocation = latestVersion((convocationsResult.data ?? []).filter((row: Json) => matchesLearnerRecipient(row, access) && text(row.storage_path)));
  const resources: Json[] = [];

  if (convention) {
    const conventionId = text(convention.id);
    resources.push({
      id: `portal:convention:${conventionId}`,
      document_type: "learner_convention",
      linked_object_type: "convention",
      linked_object_id: conventionId,
      logical_name: "Convention de formation",
      version: convention.version ?? null,
      status: "published",
      mime_type: null,
      created_at: convention.generated_at ?? null,
    });
    resources.push({
      id: `portal:regulations:${conventionId}`,
      document_type: "internal_regulations",
      linked_object_type: "convention",
      linked_object_id: conventionId,
      logical_name: "Règlement intérieur (annexe de la convention)",
      version: convention.version ?? null,
      status: "published",
      mime_type: null,
      created_at: convention.generated_at ?? null,
    });
  }

  if (convocation) {
    const convocationId = text(convocation.id);
    resources.push({
      id: `portal:welcome:${convocationId}`,
      document_type: "welcome_booklet",
      linked_object_type: "convocation",
      linked_object_id: convocationId,
      logical_name: "Livret d’accueil (annexe de la convocation)",
      version: convocation.version ?? null,
      status: "published",
      mime_type: null,
      created_at: convocation.generated_at ?? null,
    });
  }

  return resources;
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params; const admin = getAdminSupabase();
  const { data: access, error: accessError } = await admin.from("daily_portal_access_tokens").select("*").eq("token", text(token)).maybeSingle();
  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 500 });
  if (!access) return NextResponse.json({ error: "Portail introuvable." }, { status: 404 });
  if (["revoked", "expired"].includes(String(access.status ?? ""))) return NextResponse.json({ error: "Cet accès n’est plus actif." }, { status: 403 });
  if (access.expires_at && new Date(access.expires_at).getTime() < Date.now()) return NextResponse.json({ error: "Ce lien a expiré." }, { status: 410 });

  const { data: session, error: sessionError } = await admin.from("daily_sessions").select("id,organisation_id,companies").eq("id", access.session_id).neq("status", "archived").maybeSingle();
  if (sessionError || !session) return NextResponse.json({ error: sessionError?.message ?? "Session introuvable." }, { status: sessionError ? 500 : 404 });
  const documentTypes = access.portal_type === "learner" ? learnerTypes : ["training_program", "completion_certificate", "organisation_shared"];
  const { data: documents, error: documentError } = await admin.from("daily_documents").select("id,document_type,linked_object_type,linked_object_id,logical_name,version,status,mime_type,created_at,metadata").eq("organisation_id", session.organisation_id).eq("is_current", true).in("status", published).in("document_type", documentTypes).order("created_at", { ascending: false });
  if (documentError) return NextResponse.json({ error: documentError.message }, { status: 500 });

  let allowedEnrolmentIds: string[] = [];
  let allowedLearnerIds: string[] = [];
  if (access.portal_type === "learner") {
    const { data: rows } = await admin.from("daily_session_enrolments").select("id,learner_id,daily_learners(email)").eq("session_id", session.id).eq("organisation_id", session.organisation_id).not("status", "in", "(declined,cancelled,abandoned)");
    const matchingRows = (rows ?? []).filter((row: Json) => { const learner = Array.isArray(row.daily_learners) ? row.daily_learners[0] : row.daily_learners; return email((learner as Json | undefined)?.email) === email(access.entity_email); });
    allowedEnrolmentIds = matchingRows.map((row: Json) => text(row.id)).filter(Boolean);
    allowedLearnerIds = matchingRows.map((row: Json) => text(row.learner_id)).filter(Boolean);
  } else if (access.portal_type === "enterprise") {
    const company = array(session.companies).find((item) => email(item.email) === email(access.entity_email) || text(item.name).toLowerCase() === text(access.entity_name).toLowerCase());
    const participantEmails = new Set(array(company?.participants).map((item) => email(item.email)).filter(Boolean));
    if (participantEmails.size) {
      const { data: rows } = await admin.from("daily_session_enrolments").select("id,daily_learners(email)").eq("session_id", session.id).eq("organisation_id", session.organisation_id).not("status", "in", "(declined,cancelled,abandoned)");
      allowedEnrolmentIds = (rows ?? []).filter((row: Json) => { const learner = Array.isArray(row.daily_learners) ? row.daily_learners[0] : row.daily_learners; return participantEmails.has(email((learner as Json | undefined)?.email)); }).map((row: Json) => text(row.id)).filter(Boolean);
    }
  }

  const visible = (documents ?? []).filter((document: Json) => {
    if (document.document_type === "training_program") return document.linked_object_type === "session" && document.linked_object_id === session.id;
    if (["convocation", "registration_positioning", "completion_certificate"].includes(text(document.document_type))) return access.portal_type === "learner" && document.linked_object_type === "enrolment" && allowedEnrolmentIds.includes(text(document.linked_object_id));
    const metadata = document.metadata && typeof document.metadata === "object" && !Array.isArray(document.metadata) ? document.metadata as Json : {};
    const scope = text(metadata.distribution_scope);
    if (scope === "organisation") return access.portal_type === "learner" || access.portal_type === "trainer";
    if (scope === "session") return text(metadata.session_id) === session.id;
    if (scope === "learners") return access.portal_type === "learner" && text(metadata.session_id) === session.id && Array.isArray(metadata.learner_ids) && metadata.learner_ids.map(String).some((learnerId) => allowedLearnerIds.includes(learnerId));
    return false;
  });

  let pretrainingResources: Json[] = [];
  try {
    pretrainingResources = await loadLearnerPretrainingResources(admin, session.id, access as Json);
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Documents avant formation indisponibles." }, { status: 500 });
  }

  return NextResponse.json({ documents: [...pretrainingResources, ...visible] });
}
