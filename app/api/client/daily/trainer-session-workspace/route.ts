import { NextResponse } from "next/server";
import { refreshDailyEndEvaluationsChecklist, tryEnsureDailyPosttrainingDocuments } from "@/lib/server/dailyEndEvaluationLifecycle";
import { refreshDailyAttendanceChecklist } from "@/lib/server/dailyAttendanceChecklist";
import { activeDailyEnrolment } from "@/lib/server/dailyEndEvaluations";
import { getAssignedDailyTrainerSession, getDailyTrainerWorkspaceContext } from "@/lib/server/dailyTrainerWorkspaceContext";

const text = (value: unknown) => String(value ?? "").trim();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACQUISITION_OUTCOME: Record<string, string> = { acquis: "achieved", en_cours: "partially_achieved", non_acquis: "not_achieved" };

export async function GET(request: Request) {
  const context = await getDailyTrainerWorkspaceContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  const session = await getAssignedDailyTrainerSession(context, sessionId);
  if (!session) return NextResponse.json({ error: "Session non affectée à ce formateur." }, { status: 404 });
  const [enrolmentsResult, slotsResult, recordsResult, documentsResult, trainerSignaturesResult] = await Promise.all([
    context.admin.from("daily_session_enrolments").select("id,learner_id,status,daily_learners(id,first_name,last_name,email)").eq("organisation_id", context.orgId).eq("session_id", sessionId).not("status", "in", "(cancelled,declined,abandoned)"),
    context.admin.from("daily_attendance_slots").select("*").eq("organisation_id", context.orgId).eq("session_id", sessionId).neq("status", "cancelled").order("slot_date").order("starts_at"),
    context.admin.from("daily_attendance_records").select("id,slot_id,enrolment_id,status,signed_at,evidence_metadata").eq("organisation_id", context.orgId).eq("session_id", sessionId),
    context.admin.from("daily_documents").select("id,document_type,logical_name,mime_type,created_at,metadata,enrolment_id,status,version").eq("organisation_id", context.orgId).eq("session_id", sessionId).eq("is_current", true).neq("status", "archived").in("document_type", ["trainer_resource", "attendance_paper_evidence", "learning_assessment_evidence"]).order("created_at", { ascending: false }),
    context.admin.from("daily_documents").select("id,document_type,logical_name,created_at,metadata").eq("organisation_id", context.orgId).eq("session_id", sessionId).eq("document_type", "trainer_signature_evidence").eq("is_current", true).neq("status", "archived"),
  ]);
  const error = enrolmentsResult.error ?? slotsResult.error ?? recordsResult.error ?? documentsResult.error ?? trainerSignaturesResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const enrolments = enrolmentsResult.data ?? [], slots = slotsResult.data ?? [];
  const enrolmentIds = new Set(enrolments.map(row => row.id)), slotIds = new Set(slots.map(row => row.id));
  const records = (recordsResult.data ?? []).filter(row => enrolmentIds.has(row.enrolment_id) && slotIds.has(row.slot_id));
  const trainerSignatures = (trainerSignaturesResult.data ?? []).map((doc) => {
    const meta = (doc.metadata && typeof doc.metadata === "object") ? doc.metadata as Record<string, unknown> : {};
    return {
      id: doc.id,
      slot_id: String(meta.slot_id ?? ""),
      signed_at: String(meta.signed_at ?? doc.created_at ?? ""),
      trainer_profile_id: String(meta.trainer_profile_id ?? ""),
      trainer_name: String(meta.trainer_name ?? doc.logical_name ?? "Formateur"),
    };
  }).filter((item) => item.slot_id && slotIds.has(item.slot_id));
  return NextResponse.json({ session, enrolments, slots, records, documents: documentsResult.data ?? [], trainerSignatures, isAssisted: context.assisted });
}

export async function POST(request: Request) {
  const context = await getDailyTrainerWorkspaceContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const formData = await request.formData();
  const sessionId = text(formData.get("session_id"));
  const kind = text(formData.get("kind"));
  const enrolmentId = text(formData.get("enrolment_id")) || null;
  const slotId = text(formData.get("slot_id")) || null;
  const requestId = text(formData.get("request_id"));
  const file = formData.get("file");
  const session = await getAssignedDailyTrainerSession(context, sessionId);
  if (!session) return NextResponse.json({ error: "Session non affectée à ce formateur." }, { status: 404 });

  if (kind === "trainer_signature") {
    if (context.assisted) {
      return NextResponse.json({ error: "Consultation déléguée : la signature personnelle ne peut pas être effectuée par un tiers." }, { status: 403 });
    }
    if (!slotId) return NextResponse.json({ error: "Créneau d’émargement requis." }, { status: 400 });
    const { data: slot } = await context.admin.from("daily_attendance_slots").select("id,slot_date,starts_at,ends_at,label,status").eq("organisation_id", context.orgId).eq("session_id", sessionId).eq("id", slotId).maybeSingle();
    if (!slot || slot.status === "cancelled") return NextResponse.json({ error: "Créneau invalide ou annulé." }, { status: 404 });

    const { data: existing } = await context.admin.from("daily_documents").select("id").eq("organisation_id", context.orgId).eq("session_id", sessionId).eq("document_type", "trainer_signature_evidence").eq("is_current", true).neq("status", "archived").filter("metadata->>slot_id", "eq", slotId).filter("metadata->>trainer_profile_id", "eq", context.trainerId).maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Votre émargement est déjà enregistré pour ce créneau." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const documentId = crypto.randomUUID();
    const metadata = {
      source: "trainer_workspace_self_signature",
      slot_id: slotId,
      trainer_profile_id: context.trainerId,
      trainer_name: context.trainerName,
      signed_at: now,
      slot_date: slot.slot_date,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      slot_label: slot.label ?? null,
    };

    const { data: document, error: docError } = await context.admin.from("daily_documents").insert({
      id: documentId,
      organisation_id: context.orgId,
      formation_id: session.formation_id,
      session_id: sessionId,
      document_type: "trainer_signature_evidence",
      linked_object_type: "slot",
      linked_object_id: slotId,
      version: 1,
      status: "active",
      logical_name: `Émargement formateur — ${context.trainerName}`,
      bucket: "documents",
      storage_path: `daily/${context.orgId}/trainer/${context.trainerId}/${sessionId}/trainer_signature/${slotId}-${documentId}.json`,
      mime_type: "application/json",
      size_bytes: 0,
      sha256: "",
      created_by: context.user.id,
      updated_by: context.user.id,
      is_current: true,
      metadata,
    }).select("id").single();

    if (docError || !document) {
      return NextResponse.json({ error: docError?.message ?? "Enregistrement de la signature impossible." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, signature_id: document.id, signed_at: now });
  }

  if (!["resource", "attendance_paper", "external_evaluation"].includes(kind)) return NextResponse.json({ error: "Type d’import invalide." }, { status: 400 });
  if (!(file instanceof File) || !file.size || file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Fichier requis, 25 Mo maximum." }, { status: 400 });
  const allowed = ["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];
  if (!allowed.includes(file.type)) return NextResponse.json({ error: "Format autorisé : PDF, image ou Word." }, { status: 400 });
  if (kind === "external_evaluation" && !UUID_PATTERN.test(requestId)) return NextResponse.json({ error: "Identifiant de tentative invalide." }, { status: 400 });

  const availableFromRaw = text(formData.get("available_from"));
  const availableFrom = availableFromRaw ? new Date(availableFromRaw) : null;
  if (kind === "resource" && availableFrom && Number.isNaN(availableFrom.getTime())) return NextResponse.json({ error: "Date de mise à disposition invalide." }, { status: 400 });

  let enrolment: { id: string; learner_id: string; status: string } | null = null;
  if (enrolmentId) {
    const { data } = await context.admin.from("daily_session_enrolments").select("id,learner_id,status").eq("organisation_id", context.orgId).eq("session_id", sessionId).eq("id", enrolmentId).maybeSingle();
    if (!data || !activeDailyEnrolment(data.status)) return NextResponse.json({ error: "Apprenant hors de cette session ou inscription inactive." }, { status: 404 });
    enrolment = data;
  }
  let slot: Record<string, unknown> | null = null;
  if (slotId) {
    const { data } = await context.admin.from("daily_attendance_slots").select("id,slot_date,starts_at,ends_at,label").eq("organisation_id", context.orgId).eq("session_id", sessionId).eq("id", slotId).maybeSingle();
    if (!data) return NextResponse.json({ error: "Créneau hors de cette session." }, { status: 404 });
    slot = data;
  }
  if (kind === "attendance_paper" && (!enrolment || !slot)) return NextResponse.json({ error: "Apprenant et créneau requis pour une preuve papier." }, { status: 400 });
  if (kind === "external_evaluation" && !enrolment) return NextResponse.json({ error: "Apprenant requis pour une évaluation externe." }, { status: 400 });

  const note = text(formData.get("comment"));
  const scoreRaw = text(formData.get("score"));
  const score = scoreRaw === "" ? null : Number(scoreRaw);
  const acquisitionLevel = text(formData.get("acquisition_level")) || null;
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 20)) return NextResponse.json({ error: "La note doit être comprise entre 0 et 20." }, { status: 400 });
  if (acquisitionLevel && !ACQUISITION_OUTCOME[acquisitionLevel]) return NextResponse.json({ error: "Niveau d’acquisition invalide." }, { status: 400 });
  if (kind === "external_evaluation" && !acquisitionLevel) return NextResponse.json({ error: "Niveau d’acquisition requis pour une évaluation externe." }, { status: 400 });

  const documentType = kind === "resource" ? "trainer_resource" : kind === "attendance_paper" ? "attendance_paper_evidence" : "learning_assessment_evidence";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (kind === "external_evaluation") {
    const { data: replay } = await context.admin.from("daily_documents").select("id,organisation_id,session_id,enrolment_id,document_type,sha256").eq("id", requestId).maybeSingle();
    if (replay) {
      const matches = replay.organisation_id === context.orgId && replay.session_id === sessionId && replay.enrolment_id === enrolmentId && replay.document_type === "learning_assessment_evidence" && replay.sha256 === hash;
      if (!matches) return NextResponse.json({ error: "Cette tentative existe déjà avec un autre contenu." }, { status: 409 });
      const now = new Date().toISOString();
      const { error: assessmentError } = await context.admin.from("daily_learning_assessments").upsert({
        organisation_id: context.orgId, session_id: sessionId, enrolment_id: enrolmentId, outcome: ACQUISITION_OUTCOME[acquisitionLevel!],
        score, score_max: score === null ? null : 20, method: "Évaluation externe formateur", notes: note || null,
        assessed_by: context.user.id, assessed_at: now, updated_at: now,
      }, { onConflict: "session_id,enrolment_id" });
      if (assessmentError) return NextResponse.json({ error: assessmentError.message }, { status: 500 });
      await refreshDailyEndEvaluationsChecklist(context.admin, context.orgId, sessionId);
      await tryEnsureDailyPosttrainingDocuments(context.admin, context.orgId, context.user.id, sessionId);
      return NextResponse.json({ ok: true, document_id: replay.id, replayed: true });
    }
  }

  const documentId = kind === "external_evaluation" ? requestId : crypto.randomUUID();
  const storageName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `daily/${context.orgId}/trainer/${context.trainerId}/${sessionId}/${documentType}/${documentId}-${storageName}`;
  const { error: uploadError } = await context.admin.storage.from("documents").upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const metadata = { source: "trainer_workspace", trainer_profile_id: context.trainerId, trainer_name: context.trainerName, available_from: kind === "resource" ? (availableFrom?.toISOString() ?? new Date().toISOString()) : null, slot_id: slotId, slot, comment: note || null, score_20: score, acquisition_level: acquisitionLevel };
  const now = new Date().toISOString();
  let document: { id: string } | null = null;
  let documentError: { message: string } | null = null;
  if (kind === "external_evaluation") {
    const result = await context.admin.rpc("daily_replace_learning_assessment_evidence", {
      p_document_id: documentId, p_organisation_id: context.orgId, p_formation_id: session.formation_id, p_session_id: sessionId,
      p_enrolment_id: enrolmentId, p_learner_id: enrolment?.learner_id, p_logical_name: text(formData.get("title")) || file.name,
      p_bucket: "documents", p_storage_path: storagePath, p_mime_type: file.type, p_size_bytes: file.size, p_sha256: hash,
      p_created_by: context.user.id, p_metadata: metadata,
    }).single();
    document = result.data as { id: string } | null;
    documentError = result.error;
  } else {
    const result = await context.admin.from("daily_documents").insert({
      organisation_id: context.orgId, formation_id: session.formation_id, session_id: sessionId, learner_id: enrolment?.learner_id ?? null,
      enrolment_id: enrolmentId, document_type: documentType, linked_object_type: enrolmentId ? "enrolment" : "session", linked_object_id: enrolmentId ?? sessionId,
      version: 1, status:kind==="resource"?"published":"active", published_at: kind === "resource" ? now : null,
      logical_name: text(formData.get("title")) || file.name, bucket: "documents", storage_path: storagePath, mime_type: file.type,
      size_bytes: file.size, sha256: hash, created_by: context.user.id, updated_by: context.user.id, is_current: true, metadata,
    }).select("id").single();
    document = result.data;
    documentError = result.error;
  }
  if (documentError || !document) {
    await context.admin.storage.from("documents").remove([storagePath]);
    return NextResponse.json({ error: documentError?.message ?? "Enregistrement impossible." }, { status: 500 });
  }

  if (kind === "attendance_paper") {
    const { data: existing, error: readError } = await context.admin.from("daily_attendance_records").select("id").eq("organisation_id", context.orgId).eq("session_id", sessionId).eq("slot_id", slotId).eq("enrolment_id", enrolmentId).maybeSingle();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
    const patch = { status:"present", signed_at: now, validated_by: context.user.id, validated_at: now, evidence_metadata: { source:"paper_trainer", document_id: document.id, trainer_profile_id: context.trainerId } };
    const writeResult = existing ? await context.admin.from("daily_attendance_records").update(patch).eq("id", existing.id) : await context.admin.from("daily_attendance_records").insert({ organisation_id: context.orgId, session_id: sessionId, slot_id: slotId, enrolment_id: enrolmentId, ...patch });
    if (writeResult.error) return NextResponse.json({ error: writeResult.error.message }, { status: 500 });
    await refreshDailyAttendanceChecklist(context.admin, context.orgId, sessionId);
  }
  if (kind === "external_evaluation") {
    const { error: assessmentError } = await context.admin.from("daily_learning_assessments").upsert({
      organisation_id: context.orgId, session_id: sessionId, enrolment_id: enrolmentId, outcome: ACQUISITION_OUTCOME[acquisitionLevel!],
      score, score_max: score === null ? null : 20, method: "Évaluation externe formateur", notes: note || null,
      assessed_by: context.user.id, assessed_at: now, updated_at: now,
    }, { onConflict: "session_id,enrolment_id" });
    if (assessmentError) return NextResponse.json({ error: assessmentError.message }, { status: 500 });
    await refreshDailyEndEvaluationsChecklist(context.admin, context.orgId, sessionId);
    await tryEnsureDailyPosttrainingDocuments(context.admin, context.orgId, context.user.id, sessionId);
  }
  return NextResponse.json({ ok: true, document_id: document.id });
}
