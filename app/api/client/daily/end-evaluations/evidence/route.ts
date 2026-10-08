import { NextResponse } from "next/server";

import { getDailyOrganisationContext, getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";
import { activeDailyEnrolment } from "@/lib/server/dailyEndEvaluations";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "evaluation";
}

async function sha256(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  const context = await getDailyOrganisationReadContext(request, ["sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const documentId = new URL(request.url).searchParams.get("document_id")?.trim() ?? "";
  if (!UUID.test(documentId)) return NextResponse.json({ error: "Document invalide." }, { status: 400 });
  const { data: document, error } = await context.admin.from("daily_documents")
    .select("id,bucket,storage_path,logical_name,mime_type")
    .eq("id", documentId).eq("organisation_id", context.organisationId)
    .eq("document_type", "learning_assessment_evidence").is("archived_at", null).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!document || document.bucket !== "documents" || !document.storage_path?.startsWith(`daily/${context.organisationId}/`)) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }
  const { data: signed, error: signError } = await context.admin.storage.from("documents").createSignedUrl(document.storage_path, 120, { download: document.logical_name });
  if (signError || !signed?.signedUrl) return NextResponse.json({ error: "Téléchargement indisponible." }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}

export async function POST(request: Request) {
  const context = await getDailyOrganisationContext(request, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.assisted) return NextResponse.json({ error: "L’assistance agent est en lecture seule." }, { status: 403 });
  const formData = await request.formData().catch(() => null);
  const sessionId = String(formData?.get("session_id") ?? "").trim();
  const enrolmentId = String(formData?.get("enrolment_id") ?? "").trim();
  const requestId = String(formData?.get("request_id") ?? "").trim();
  const file = formData?.get("file");
  if (!UUID.test(sessionId) || !UUID.test(enrolmentId) || !UUID.test(requestId) || !(file instanceof File)) {
    return NextResponse.json({ error: "Session, apprenant, identifiant de dépôt et fichier valides sont requis." }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) return NextResponse.json({ error: "Format accepté : PDF, JPG ou PNG." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Le fichier doit faire moins de 10 Mo." }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const hash = await sha256(buffer);
  const { data: existing, error: existingError } = await context.admin.from("daily_documents")
    .select("id,logical_name,status,formation_id,session_id,learner_id,enrolment_id,version,previous_document_id,created_at,sha256,document_type,organisation_id")
    .eq("id", requestId).maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing) {
    const matches = existing.organisation_id === context.organisationId && existing.session_id === sessionId
      && existing.enrolment_id === enrolmentId && existing.document_type === "learning_assessment_evidence" && existing.sha256 === hash;
    if (!matches) return NextResponse.json({ error: "Identifiant de dépôt déjà utilisé." }, { status: 409 });
    return NextResponse.json({ ok: true, document: existing, replayed: true });
  }

  const [{ data: session, error: sessionError }, { data: enrolment, error: enrolmentError }] = await Promise.all([
    context.admin.from("daily_sessions").select("id,status,formation_id").eq("organisation_id", context.organisationId).eq("id", sessionId).maybeSingle(),
    context.admin.from("daily_session_enrolments").select("id,status,learner_id").eq("organisation_id", context.organisationId).eq("session_id", sessionId).eq("id", enrolmentId).maybeSingle(),
  ]);
  if (sessionError || enrolmentError) return NextResponse.json({ error: sessionError?.message ?? enrolmentError?.message ?? "Lecture impossible." }, { status: 500 });
  if (!session || ["archived", "cancelled"].includes(session.status ?? "")) return NextResponse.json({ error: "Session introuvable ou inactive." }, { status: 404 });
  if (!enrolment || !activeDailyEnrolment(enrolment.status)) return NextResponse.json({ error: "Inscription introuvable ou inactive." }, { status: 404 });

  const originalName = safeName(file.name);
  const storagePath = `daily/${context.organisationId}/session/${sessionId}/evaluation-evidence/${enrolmentId}/${requestId}-${originalName}`;
  const { error: uploadError } = await context.admin.storage.from("documents").upload(storagePath, buffer, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
  const { data: document, error: documentError } = await context.admin.rpc("daily_replace_learning_assessment_evidence", {
    p_document_id: requestId, p_organisation_id: context.organisationId, p_session_id: sessionId, p_enrolment_id: enrolmentId,
    p_logical_name: `evaluation-acquis-${originalName}`, p_storage_path: storagePath, p_mime_type: file.type,
    p_size_bytes: file.size, p_sha256: hash, p_actor_id: context.user.id,
    p_metadata: { formation_id: session.formation_id, session_id: sessionId, learner_id: enrolment.learner_id, enrolment_id: enrolmentId, original_filename: file.name, source: "daily_external_learning_assessment", uploaded_at: new Date().toISOString() },
  });
  if (documentError || !document) {
    await context.admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: documentError?.message ?? "Enregistrement de la preuve impossible." }, { status: documentError?.code === "23505" ? 409 : 500 });
  }
  return NextResponse.json({ ok: true, document });
}
