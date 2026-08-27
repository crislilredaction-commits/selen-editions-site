import { NextResponse } from "next/server";

import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";
import { activeDailyEnrolment } from "@/lib/server/dailyEndEvaluations";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function safeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "evaluation";
}

async function sha256(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  const context = await getDailyOrganisationContext(request, "sessions");
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.assisted) {
    return NextResponse.json({ error: "L’assistance agent est en lecture seule." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const sessionId = String(formData?.get("session_id") ?? "").trim();
  const enrolmentId = String(formData?.get("enrolment_id") ?? "").trim();
  const file = formData?.get("file");

  if (!sessionId || !enrolmentId || !(file instanceof File)) {
    return NextResponse.json({ error: "Session, apprenant et fichier sont requis." }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Format accepté : PDF, JPG ou PNG." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Le fichier doit faire moins de 10 Mo." }, { status: 400 });
  }

  const [{ data: session, error: sessionError }, { data: enrolment, error: enrolmentError }] = await Promise.all([
    context.admin
      .from("daily_sessions")
      .select("id,status,formation_id")
      .eq("organisation_id", context.organisationId)
      .eq("id", sessionId)
      .maybeSingle(),
    context.admin
      .from("daily_session_enrolments")
      .select("id,status,learner_id")
      .eq("organisation_id", context.organisationId)
      .eq("session_id", sessionId)
      .eq("id", enrolmentId)
      .maybeSingle(),
  ]);

  if (sessionError || enrolmentError) {
    return NextResponse.json(
      { error: sessionError?.message ?? enrolmentError?.message ?? "Lecture impossible." },
      { status: 500 },
    );
  }
  if (!session || session.status === "archived") {
    return NextResponse.json({ error: "Session introuvable ou archivée." }, { status: 404 });
  }
  if (!enrolment || !activeDailyEnrolment(enrolment.status)) {
    return NextResponse.json({ error: "Inscription introuvable ou inactive." }, { status: 404 });
  }

  const buffer = await file.arrayBuffer();
  const hash = await sha256(buffer);
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const originalName = safeName(file.name);
  const storagePath = `daily/${context.organisationId}/session/${sessionId}/evaluation-evidence/${enrolmentId}/${stamp}-${originalName}`;

  const { error: uploadError } = await context.admin.storage
    .from("documents")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: document, error: documentError } = await context.admin
    .from("daily_documents")
    .insert({
      organisation_id: context.organisationId,
      document_type: "learning_assessment_evidence",
      linked_object_type: "enrolment",
      linked_object_id: enrolmentId,
      formation_id: session.formation_id,
      session_id: sessionId,
      learner_id: enrolment.learner_id,
      enrolment_id: enrolmentId,
      version: 1,
      status: "to_check",
      logical_name: `evaluation-acquis-${originalName}`,
      bucket: "documents",
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      sha256: hash,
      created_by: context.user.id,
      updated_by: context.user.id,
      is_current: true,
      metadata: {
        formation_id: session.formation_id,
        session_id: sessionId,
        learner_id: enrolment.learner_id,
        enrolment_id: enrolmentId,
        original_filename: file.name,
        source: "daily_external_learning_assessment",
        uploaded_at: new Date().toISOString(),
      },
    })
    .select("id,logical_name,status,formation_id,session_id,learner_id,enrolment_id,created_at")
    .single();

  if (documentError || !document) {
    await context.admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json(
      { error: documentError?.message ?? "Enregistrement de la preuve impossible." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, document });
}
