import {
  buildAttendanceSummaryHtml,
  buildCompletionCertificateHtml,
  completionCertificateLearningResult,
} from "@/lib/server/dailyPosttrainingDocumentHtml";

export const POSTTRAINING_DOCUMENT_TYPES = ["attendance_summary", "completion_certificate"] as const;

type DocumentType = typeof POSTTRAINING_DOCUMENT_TYPES[number];
type GenerationMode = "manual" | "auto";
type AttendanceEntry = { slot: any; record: any };

export class PosttrainingDocumentError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PosttrainingDocumentError";
    this.status = status;
  }
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function safe(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "document";
}

function learnerFrom(value: unknown) {
  return Array.isArray(value) ? value[0] ?? {} : value && typeof value === "object" ? value : {};
}

function learnerName(enrolment: any) {
  const learner: any = learnerFrom(enrolment.daily_learners);
  return `${text(learner.first_name)} ${text(learner.last_name)}`.trim() || text(learner.email) || "Apprenant";
}

function durationHours(start: unknown, end: unknown) {
  const [sh, sm] = text(start).slice(0, 5).split(":").map(Number);
  const [eh, em] = text(end).slice(0, 5).split(":").map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return 0;
  return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function generate(args: {
  admin: any;
  organisationId: string;
  userId: string;
  documentType: DocumentType;
  linkedObjectType: "session" | "enrolment";
  linkedObjectId: string;
  logicalName: string;
  filenameBase: string;
  html: string;
  metadata: Record<string, unknown>;
}) {
  const {
    admin,
    organisationId,
    userId,
    documentType,
    linkedObjectType,
    linkedObjectId,
    logicalName,
    filenameBase,
    html,
    metadata,
  } = args;
  const { data: rows, error: readError } = await admin
    .from("daily_documents")
    .select("id,version,is_current")
    .eq("organisation_id", organisationId)
    .eq("document_type", documentType)
    .eq("linked_object_type", linkedObjectType)
    .eq("linked_object_id", linkedObjectId)
    .eq("logical_name", logicalName)
    .order("version", { ascending: false })
    .limit(1);
  if (readError) throw new Error(readError.message);

  const previous = rows?.[0] ?? null;
  const version = Number(previous?.version ?? 0) + 1;
  if (previous?.is_current) {
    const { error } = await admin
      .from("daily_documents")
      .update({ is_current: false, updated_by: userId })
      .eq("id", previous.id);
    if (error) throw new Error(error.message);
  }

  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const storagePath = `daily/${organisationId}/${linkedObjectType}/${linkedObjectId}/${documentType}/${safe(filenameBase)}-v${version}-${stamp}.doc`;
  const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(storagePath, blob, { contentType: "application/msword;charset=utf-8", upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await admin
    .from("daily_documents")
    .insert({
      organisation_id: organisationId,
      document_type: documentType,
      linked_object_type: linkedObjectType,
      linked_object_id: linkedObjectId,
      version,
      status: "to_check",
      logical_name: logicalName,
      bucket: "documents",
      storage_path: storagePath,
      mime_type: "application/msword",
      size_bytes: new TextEncoder().encode(html).byteLength,
      sha256: await sha256(html),
      created_by: userId,
      updated_by: userId,
      is_current: true,
      previous_document_id: previous?.id ?? null,
      metadata: {
        ...metadata,
        generated_by: "daily_posttraining",
        generated_at: new Date().toISOString(),
      },
    })
    .select("*")
    .single();
  if (error) {
    await admin.storage.from("documents").remove([storagePath]);
    throw new Error(error.message);
  }
  return data;
}

async function load(admin: any, organisationId: string, sessionId: string) {
  const [
    { data: session, error: sessionError },
    { data: enrolments, error: enrolmentError },
    { data: slots, error: slotError },
    { data: records, error: recordError },
    { data: assessments, error: assessmentError },
    { data: org, error: orgError },
  ] = await Promise.all([
    admin
      .from("daily_sessions")
      .select("id,organisation_id,internal_reference,start_date,end_date,status,daily_formations(id,title)")
      .eq("id", sessionId)
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    admin
      .from("daily_session_enrolments")
      .select("id,status,learner_id,daily_learners(id,first_name,last_name,email)")
      .eq("session_id", sessionId)
      .eq("organisation_id", organisationId)
      .not("status", "in", '(declined,cancelled,abandoned)'),
    admin
      .from("daily_attendance_slots")
      .select("id,slot_date,starts_at,ends_at,status")
      .eq("session_id", sessionId)
      .eq("organisation_id", organisationId)
      .neq("status", "cancelled")
      .order("slot_date")
      .order("starts_at"),
    admin
      .from("daily_attendance_records")
      .select("id,slot_id,enrolment_id,status,proof_sha256,signed_at")
      .eq("session_id", sessionId)
      .eq("organisation_id", organisationId),
    admin
      .from("daily_learning_assessments")
      .select("enrolment_id,outcome,assessed_at")
      .eq("session_id", sessionId)
      .eq("organisation_id", organisationId),
    admin
      .from("organisations")
      .select("id,name,legal_name,siret,nda_number")
      .eq("id", organisationId)
      .maybeSingle(),
  ]);

  const error = sessionError ?? enrolmentError ?? slotError ?? recordError ?? assessmentError ?? orgError;
  if (error) throw new Error(error.message);
  if (!session) throw new PosttrainingDocumentError("Session introuvable.", 404);
  return {
    session,
    enrolments: enrolments ?? [],
    slots: slots ?? [],
    records: records ?? [],
    assessments: assessments ?? [],
    org,
  };
}

async function currentDocuments(admin: any, organisationId: string, sessionId: string) {
  const { data, error } = await admin
    .from("daily_documents")
    .select("id,document_type,linked_object_type,linked_object_id,status")
    .eq("organisation_id", organisationId)
    .in("document_type", [...POSTTRAINING_DOCUMENT_TYPES])
    .eq("is_current", true)
    .contains("metadata", { session_id: sessionId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function syncChecklist(admin: any, organisationId: string, sessionId: string, expected: number) {
  const docs = await currentDocuments(admin, organisationId, sessionId);
  const allPresent = expected > 0 && docs.length >= expected;
  const allValidated = allPresent && docs.every((doc: any) => doc.status === "validated");
  const status = allValidated ? "validated" : allPresent ? "to_review" : docs.length ? "in_progress" : "todo";
  await admin
    .from("daily_session_checklist_items")
    .update({ status })
    .eq("organisation_id", organisationId)
    .eq("session_id", sessionId)
    .eq("item_key", "posttraining_documents")
    .neq("status", "not_applicable");
}

function autoBlocked(reason: string, eligibleCertificates = 0) {
  return {
    generated: false,
    reason,
    documents: [] as any[],
    count: 0,
    eligibleCertificates,
  };
}

export async function generatePosttrainingDocuments(args: {
  admin: any;
  organisationId: string;
  userId: string;
  sessionId: string;
  mode?: GenerationMode;
  now?: Date;
}) {
  const { admin, organisationId, userId, sessionId, mode = "manual", now = new Date() } = args;
  const automatic = mode === "auto";
  const { session, enrolments, slots, records, assessments, org } = await load(admin, organisationId, sessionId);

  if (slots.length === 0) {
    if (automatic) return autoBlocked("no_attendance_slots");
    throw new PosttrainingDocumentError("Aucun créneau de présence n’est disponible pour établir les documents de fin.");
  }
  if (enrolments.length === 0) {
    if (automatic) return autoBlocked("no_active_enrolments");
    throw new PosttrainingDocumentError("Aucun apprenant actif n’est inscrit à cette session.");
  }

  if (automatic) {
    const today = now.toISOString().slice(0, 10);
    if (!text(session.end_date) || text(session.end_date) > today) return autoBlocked("session_not_ended");
    if (slots.some((slot: any) => slot.status !== "closed")) return autoBlocked("attendance_slots_open");
  }

  const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
  const title = text(formation?.title) || "Formation";
  const orgName = text(org?.legal_name || org?.name) || "Organisme de formation";
  const recordMap = new Map(records.map((record: any) => [`${record.slot_id}:${record.enrolment_id}`, record]));
  const assessmentMap = new Map(assessments.map((assessment: any) => [assessment.enrolment_id, assessment]));
  const expectedAttendance = enrolments.length * slots.length;
  let settledAttendance = 0;
  for (const enrolment of enrolments) {
    for (const slot of slots) {
      const record: any = recordMap.get(`${slot.id}:${enrolment.id}`);
      if (record && record.status !== "pending") settledAttendance += 1;
    }
  }

  if (settledAttendance < expectedAttendance) {
    if (automatic) return autoBlocked("attendance_incomplete");
    throw new PosttrainingDocumentError(
      `Finalisez les présences avant de générer les documents de fin (${settledAttendance}/${expectedAttendance}).`,
      409,
    );
  }

  if (automatic) {
    const assessmentsComplete = enrolments.every((enrolment: any) => {
      const assessment: any = assessmentMap.get(enrolment.id);
      return Boolean(assessment?.outcome) && assessment.outcome !== "pending";
    });
    if (!assessmentsComplete) return autoBlocked("assessments_incomplete");
  }

  const lines: any[] = [];
  for (const enrolment of enrolments) {
    for (const slot of slots) {
      const record: any = recordMap.get(`${slot.id}:${enrolment.id}`);
      lines.push({
        learnerName: learnerName(enrolment),
        date: text(slot.slot_date),
        start: text(slot.starts_at).slice(0, 5),
        end: text(slot.ends_at).slice(0, 5),
        status: text(record?.status),
        proofHash: record?.proof_sha256 ?? null,
      });
    }
  }

  const plannedHours = slots.reduce(
    (sum: number, slot: any) => sum + durationHours(slot.starts_at, slot.ends_at),
    0,
  );
  const eligibleEnrolments = enrolments
    .map((enrolment: any) => {
      const learnerRecords: AttendanceEntry[] = slots.map((slot: any) => ({
        slot,
        record: recordMap.get(`${slot.id}:${enrolment.id}`),
      }));
      const attendedHours = learnerRecords.reduce(
        (sum: number, entry: AttendanceEntry) =>
          entry.record?.status === "present"
            ? sum + durationHours(entry.slot.starts_at, entry.slot.ends_at)
            : sum,
        0,
      );
      return { enrolment, attendedHours };
    })
    .filter((entry: any) => entry.attendedHours > 0);

  const eligibleCertificates = eligibleEnrolments.length;
  const existing = automatic ? await currentDocuments(admin, organisationId, sessionId) : [];
  const existingKeys = new Set(
    existing.map((document: any) => `${document.document_type}:${document.linked_object_type}:${document.linked_object_id}`),
  );
  const attendanceKey = `attendance_summary:session:${sessionId}`;
  const missingCertificate = eligibleEnrolments.some(
    ({ enrolment }: any) => !existingKeys.has(`completion_certificate:enrolment:${enrolment.id}`),
  );
  if (automatic && existingKeys.has(attendanceKey) && !missingCertificate) {
    await syncChecklist(admin, organisationId, sessionId, 1 + eligibleCertificates);
    return autoBlocked("already_generated", eligibleCertificates);
  }

  const created: any[] = [];
  if (!automatic || !existingKeys.has(attendanceKey)) {
    created.push(await generate({
      admin,
      organisationId,
      userId,
      documentType: "attendance_summary",
      linkedObjectType: "session",
      linkedObjectId: sessionId,
      logicalName: "releve-presences",
      filenameBase: `releve-presences-${title}`,
      metadata: { session_id: sessionId },
      html: buildAttendanceSummaryHtml({
        organisationName: orgName,
        formationTitle: title,
        sessionReference: text(session.internal_reference),
        startDate: text(session.start_date),
        endDate: text(session.end_date),
        lines,
        generatedAt: now,
      }),
    }));
  }

  for (const { enrolment, attendedHours } of eligibleEnrolments) {
    const certificateKey = `completion_certificate:enrolment:${enrolment.id}`;
    if (automatic && existingKeys.has(certificateKey)) continue;
    const assessment: any = assessmentMap.get(enrolment.id);
    const learningOutcome = text(assessment?.outcome) || null;
    const learningResult = completionCertificateLearningResult(learningOutcome as any);
    created.push(await generate({
      admin,
      organisationId,
      userId,
      documentType: "completion_certificate",
      linkedObjectType: "enrolment",
      linkedObjectId: enrolment.id,
      logicalName: "certificat-realisation",
      filenameBase: `certificat-realisation-${learnerName(enrolment)}`,
      metadata: {
        session_id: sessionId,
        enrolment_id: enrolment.id,
        learner_id: enrolment.learner_id,
        learner_name: learnerName(enrolment),
        planned_hours: plannedHours,
        attended_hours: attendedHours,
        learning_outcome: learningOutcome,
        learning_result: learningResult,
        learning_assessed_at: assessment?.assessed_at ?? null,
      },
      html: buildCompletionCertificateHtml({
        organisationName: orgName,
        organisationSiret: text(org?.siret),
        organisationNda: text(org?.nda_number),
        formationTitle: title,
        learnerName: learnerName(enrolment),
        startDate: text(session.start_date),
        endDate: text(session.end_date),
        plannedHours,
        attendedHours,
        learningOutcome: learningOutcome as any,
        generatedAt: now,
      }),
    }));
  }

  await syncChecklist(admin, organisationId, sessionId, 1 + eligibleCertificates);
  return {
    generated: created.length > 0,
    reason: created.length > 0 ? "generated" : "already_generated",
    documents: created,
    count: created.length,
    eligibleCertificates,
  };
}

export async function ensurePosttrainingDocuments(args: {
  admin: any;
  organisationId: string;
  userId: string;
  sessionId: string;
  now?: Date;
}) {
  return generatePosttrainingDocuments({ ...args, mode: "auto" });
}
