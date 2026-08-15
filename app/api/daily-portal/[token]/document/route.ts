import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };
type JsonRecord = Record<string, unknown>;

const allowedStatuses = ["validated", "published", "signed", "active"];
const allowedTypes = ["training_program", "completion_certificate"];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedEmail(value: unknown) {
  return text(value).toLowerCase();
}

function isExpired(value: unknown) {
  const expiresAt = text(value);
  return Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
}

function relatedLearner(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) return value[0] && typeof value[0] === "object" ? value[0] as JsonRecord : null;
  return value && typeof value === "object" ? value as JsonRecord : null;
}

export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  const cleanToken = text(token);
  const documentId = new URL(request.url).searchParams.get("id") ?? "";
  if (!cleanToken || !documentId) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const supabase = getAdminSupabase();
  const { data: access, error: accessError } = await supabase
    .from("daily_portal_access_tokens")
    .select("id,session_id,portal_type,entity_email,status,expires_at")
    .eq("token", cleanToken)
    .maybeSingle();
  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 500 });
  if (!access || access.portal_type !== "learner") return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  if (isExpired(access.expires_at)) return NextResponse.json({ error: "Ce lien de portail a expiré." }, { status: 410 });

  const { data: session, error: sessionError } = await supabase
    .from("daily_sessions")
    .select("id,organisation_id,status")
    .eq("id", access.session_id)
    .neq("status", "archived")
    .maybeSingle();
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  const { data: document, error: documentError } = await supabase
    .from("daily_documents")
    .select("id,organisation_id,document_type,linked_object_type,linked_object_id,status,is_current,bucket,storage_path")
    .eq("id", documentId)
    .eq("organisation_id", session.organisation_id)
    .eq("is_current", true)
    .in("status", allowedStatuses)
    .in("document_type", allowedTypes)
    .maybeSingle();
  if (documentError) return NextResponse.json({ error: documentError.message }, { status: 500 });
  if (!document) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  let allowed = document.document_type === "training_program"
    && document.linked_object_type === "session"
    && document.linked_object_id === access.session_id;

  if (!allowed && document.document_type === "completion_certificate" && document.linked_object_type === "enrolment") {
    const entityEmail = normalizedEmail(access.entity_email);
    if (entityEmail) {
      const { data: enrolments, error: enrolmentError } = await supabase
        .from("daily_session_enrolments")
        .select("id,daily_learners(id,email)")
        .eq("session_id", access.session_id)
        .eq("organisation_id", session.organisation_id)
        .not("status", "in", "(declined,cancelled)");
      if (enrolmentError) return NextResponse.json({ error: enrolmentError.message }, { status: 500 });
      allowed = (enrolments ?? []).some((row) =>
        row.id === document.linked_object_id
        && normalizedEmail(relatedLearner(row.daily_learners)?.email) === entityEmail,
      );
    }
  }

  if (!allowed) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  const { data: signed, error: signedError } = await supabase.storage
    .from(document.bucket)
    .createSignedUrl(document.storage_path, 120);
  if (signedError || !signed?.signedUrl) return NextResponse.json({ error: "Téléchargement indisponible." }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}