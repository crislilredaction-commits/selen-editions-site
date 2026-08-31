import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };
type Json = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
const email = (value: unknown) => text(value).toLowerCase();
const array = (value: unknown): Json[] => Array.isArray(value) ? value.filter((v): v is Json => Boolean(v && typeof v === "object")) : [];
const published = ["validated", "published", "signed", "active"];

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params; const admin = getAdminSupabase();
  const { data: access, error: accessError } = await admin.from("daily_portal_access_tokens").select("*").eq("token", text(token)).maybeSingle();
  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 500 });
  if (!access) return NextResponse.json({ error: "Portail introuvable." }, { status: 404 });
  if (access.expires_at && new Date(access.expires_at).getTime() < Date.now()) return NextResponse.json({ error: "Ce lien a expiré." }, { status: 410 });

  const { data: session, error: sessionError } = await admin.from("daily_sessions").select("id,organisation_id,companies").eq("id", access.session_id).neq("status", "archived").maybeSingle();
  if (sessionError || !session) return NextResponse.json({ error: sessionError?.message ?? "Session introuvable." }, { status: sessionError ? 500 : 404 });
  const { data: documents, error: documentError } = await admin.from("daily_documents").select("id,document_type,linked_object_type,linked_object_id,logical_name,version,status,mime_type,created_at,metadata").eq("organisation_id", session.organisation_id).eq("is_current", true).in("status", published).in("document_type", ["training_program", "completion_certificate", "organisation_shared"]).order("created_at", { ascending: false });
  if (documentError) return NextResponse.json({ error: documentError.message }, { status: 500 });

  let allowedEnrolmentIds: string[] = [];
  let allowedLearnerIds: string[] = [];
  if (access.portal_type === "learner") {
    const { data: rows } = await admin.from("daily_session_enrolments").select("id,learner_id,daily_learners(email)").eq("session_id", session.id).eq("organisation_id", session.organisation_id).not("status", "in", "(declined,cancelled)");
    const matchingRows = (rows ?? []).filter((row: Json) => { const learner = Array.isArray(row.daily_learners) ? row.daily_learners[0] : row.daily_learners; return email((learner as Json | undefined)?.email) === email(access.entity_email); });
    allowedEnrolmentIds = matchingRows.map((row: Json) => text(row.id)).filter(Boolean);
    allowedLearnerIds = matchingRows.map((row: Json) => text(row.learner_id)).filter(Boolean);
  } else if (access.portal_type === "enterprise") {
    const company = array(session.companies).find((item) => email(item.email) === email(access.entity_email) || text(item.name).toLowerCase() === text(access.entity_name).toLowerCase());
    const participantEmails = new Set(array(company?.participants).map((item) => email(item.email)).filter(Boolean));
    if (participantEmails.size) {
      const { data: rows } = await admin.from("daily_session_enrolments").select("id,daily_learners(email)").eq("session_id", session.id).eq("organisation_id", session.organisation_id);
      allowedEnrolmentIds = (rows ?? []).filter((row: Json) => { const learner = Array.isArray(row.daily_learners) ? row.daily_learners[0] : row.daily_learners; return participantEmails.has(email((learner as Json | undefined)?.email)); }).map((row: Json) => text(row.id)).filter(Boolean);
    }
  }

  const visible = (documents ?? []).filter((document: Json) => {
    if (document.document_type === "training_program") return document.linked_object_type === "session" && document.linked_object_id === session.id;
    if (document.document_type === "completion_certificate") return access.portal_type !== "trainer" && document.linked_object_type === "enrolment" && allowedEnrolmentIds.includes(text(document.linked_object_id));
    const metadata = document.metadata && typeof document.metadata === "object" && !Array.isArray(document.metadata) ? document.metadata as Json : {};
    const scope = text(metadata.distribution_scope);
    if (scope === "organisation") return access.portal_type === "learner" || access.portal_type === "trainer";
    if (scope === "session") return text(metadata.session_id) === session.id;
    if (scope === "learners") return access.portal_type === "learner" && text(metadata.session_id) === session.id && Array.isArray(metadata.learner_ids) && metadata.learner_ids.map(String).some((learnerId) => allowedLearnerIds.includes(learnerId));
    return false;
  });
  return NextResponse.json({ documents: visible });
}
