import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import {DAILY_PORTAL_RESOURCE_STATUSES,DAILY_PORTAL_RESOURCE_TYPES,isDailyPortalResourceVisible} from "@/lib/server/dailyPortalResourceVisibility";
import {attendanceIsSettled,isPostsessionDownloadAvailable,personalAttendanceDocumentId} from "@/lib/server/dailyPersonalAttendance";
import {isFinalAssessmentResult,personalAssessmentEvidenceDocumentId,personalAssessmentResultDocumentId} from "@/lib/server/dailyPersonalAssessment";
import {matchesDailyLearnerPortalAccess,hasUniqueDailyLearnerRecipientEmail} from "@/lib/server/dailyPortalLearnerIdentity";
import {resolveEnterprisePortalCompany} from "@/lib/daily/enterprisePortalIdentity.mjs";

type Params = { params: Promise<{ token: string }> };
type Json = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
const email = (value: unknown) => text(value).toLowerCase();
const array = (value: unknown): Json[] => Array.isArray(value) ? value.filter((v): v is Json => Boolean(v && typeof v === "object")) : [];

function matchesLearnerRecipient(row: Json, access: Json) {
  const entityEmail = email(access.entity_email);
  return row.recipient_type === "beneficiary" && Boolean(entityEmail) && email(row.recipient_email) === entityEmail;
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

  const { data: session, error: sessionError } = await admin.from("daily_sessions").select("id,organisation_id,companies,end_date").eq("id", access.session_id).neq("status", "archived").maybeSingle();
  if (sessionError || !session) return NextResponse.json({ error: sessionError?.message ?? "Session introuvable." }, { status: sessionError ? 500 : 404 });
  const { data: documents, error: documentError } = await admin.from("daily_documents").select("id,document_type,linked_object_type,linked_object_id,logical_name,version,status,mime_type,created_at,metadata,session_id,enrolment_id,learner_id").eq("organisation_id", session.organisation_id).eq("is_current", true).is("archived_at", null).in("status", DAILY_PORTAL_RESOURCE_STATUSES).in("document_type", DAILY_PORTAL_RESOURCE_TYPES).order("created_at", { ascending: false });
  if (documentError) return NextResponse.json({ error: documentError.message }, { status: 500 });

  let allowedEnrolmentIds: string[] = [];
  let allowedLearnerIds: string[] = [];
  let matchingRows: Json[] = [];
  let learnerEmailRecipientUnique = false;
  let companyName = "";
  if (access.portal_type === "learner") {
    const { data: rows, error: enrolmentError } = await admin.from("daily_session_enrolments").select("id,learner_id,status,daily_learners(email)").eq("session_id", session.id).eq("organisation_id", session.organisation_id);
    if (enrolmentError) return NextResponse.json({ error: enrolmentError.message }, { status: 500 });
    learnerEmailRecipientUnique = hasUniqueDailyLearnerRecipientEmail(access, rows ?? []);
    matchingRows = (rows ?? []).filter((row: Json) => !["declined", "cancelled", "abandoned"].includes(text(row.status)) && matchesDailyLearnerPortalAccess(access, row));
    if (matchingRows.length !== 1) return NextResponse.json({ error: "Accès apprenant absent ou ambigu." }, { status: matchingRows.length ? 409 : 403 });
    allowedEnrolmentIds = matchingRows.map((row: Json) => text(row.id)).filter(Boolean);
    allowedLearnerIds = matchingRows.map((row: Json) => text(row.learner_id)).filter(Boolean);
  } else if (access.portal_type === "enterprise") {
    const companyIdentity = resolveEnterprisePortalCompany(array(session.companies), email(access.entity_email));
    if (companyIdentity.status !== "ok") return NextResponse.json({ error: "Identité entreprise absente ou ambiguë." }, { status: companyIdentity.status === "ambiguous" ? 409 : 403 });
    const company = companyIdentity.company;
    companyName = text(company?.name);
    const participantEmails = new Set(array(company?.participants).map((item) => email(item.email)).filter(Boolean));
    if (participantEmails.size) {
      const { data: rows } = await admin.from("daily_session_enrolments").select("id,daily_learners(email)").eq("session_id", session.id).eq("organisation_id", session.organisation_id).not("status", "in", "(declined,cancelled,abandoned)");
      allowedEnrolmentIds = (rows ?? []).filter((row: Json) => { const learner = Array.isArray(row.daily_learners) ? row.daily_learners[0] : row.daily_learners; return participantEmails.has(email((learner as Json | undefined)?.email)); }).map((row: Json) => text(row.id)).filter(Boolean);
    }
  }

  const postsessionAvailable = isPostsessionDownloadAvailable(session.end_date);
  const visible = (documents ?? []).filter((document: Json) => isDailyPortalResourceVisible({resource:document,companyName,role:access.portal_type,sessionId:session.id,enrolmentIds:allowedEnrolmentIds,learnerIds:allowedLearnerIds,postsessionAvailable}));
  const attendancePublished = (documents ?? []).some((document: Json) =>
    document.document_type === "attendance_summary"
    && text(document.session_id) === text(session.id)
    && ["published", "signed"].includes(text(document.status))
  );

  const personalAttendanceResources: Json[] = [];
  const personalAssessmentResources: Json[] = [];
  const personalAssessmentEvidenceResources: Json[] = [];
  if (access.portal_type === "learner" && postsessionAvailable && attendancePublished && allowedEnrolmentIds.length) {
    const [{ data: slots, error: slotsError }, { data: records, error: recordsError }, { data: assessments, error: assessmentsError }, { data: assessmentEvidence, error: assessmentEvidenceError }] = await Promise.all([
      admin.from("daily_attendance_slots").select("id").eq("organisation_id", session.organisation_id).eq("session_id", session.id).neq("status", "cancelled"),
      admin.from("daily_attendance_records").select("slot_id,enrolment_id,status").eq("organisation_id", session.organisation_id).eq("session_id", session.id).in("enrolment_id", allowedEnrolmentIds),
      admin.from("daily_learning_assessments").select("enrolment_id,outcome,assessed_at").eq("organisation_id", session.organisation_id).eq("session_id", session.id).in("enrolment_id", allowedEnrolmentIds),
      admin.from("daily_documents").select("id,enrolment_id,learner_id,linked_object_type,linked_object_id,logical_name,mime_type,created_at").eq("organisation_id", session.organisation_id).eq("session_id", session.id).eq("document_type", "learning_assessment_evidence").eq("is_current", true).is("archived_at", null).in("enrolment_id", allowedEnrolmentIds),
    ]);
    const attendanceError = slotsError ?? recordsError ?? assessmentsError ?? assessmentEvidenceError;
    if (attendanceError) return NextResponse.json({ error: attendanceError.message }, { status: 500 });
    const slotIds = (slots ?? []).map((slot: Json) => slot.id);
    for (const row of matchingRows) {
      const enrolmentId = text(row.id);
      const ownRecords = (records ?? []).filter((record: Json) => text(record.enrolment_id) === enrolmentId);
      if (!attendanceIsSettled(slotIds, ownRecords)) continue;
      personalAttendanceResources.push({
        id: personalAttendanceDocumentId(enrolmentId),
        document_type: "personal_attendance_summary",
        linked_object_type: "enrolment",
        linked_object_id: enrolmentId,
        logical_name: "Mon relevé de présence",
        status: "available",
        created_at: session.end_date,
      });
    }
    for (const assessment of assessments ?? []) {
      if (!isFinalAssessmentResult(assessment.outcome, assessment.assessed_at)) continue;
      const enrolmentId = text(assessment.enrolment_id);
      personalAssessmentResources.push({
        id: personalAssessmentResultDocumentId(enrolmentId),
        document_type: "personal_assessment_result",
        linked_object_type: "enrolment",
        linked_object_id: enrolmentId,
        logical_name: "Mon résultat d’évaluation finale",
        status: "available",
        created_at: assessment.assessed_at,
      });
      const matchingEnrolment = matchingRows.find((row: Json) => text(row.id) === enrolmentId);
      const evidence = (assessmentEvidence ?? []).find((document: Json) =>
        text(document.enrolment_id) === enrolmentId
        && text(document.learner_id) === text(matchingEnrolment?.learner_id)
        && document.linked_object_type === "enrolment"
        && text(document.linked_object_id) === enrolmentId
      );
      if (evidence) personalAssessmentEvidenceResources.push({
        id: personalAssessmentEvidenceDocumentId(evidence.id),
        document_type: "personal_assessment_evidence",
        linked_object_type: "enrolment",
        linked_object_id: enrolmentId,
        logical_name: evidence.logical_name || "Ma copie d’évaluation finale",
        status: "available",
        mime_type: evidence.mime_type ?? null,
        created_at: evidence.created_at ?? assessment.assessed_at,
      });
    }
  }

  let pretrainingResources: Json[] = [];
  try {
    pretrainingResources = learnerEmailRecipientUnique ? await loadLearnerPretrainingResources(admin, session.id, access as Json) : [];
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Documents avant formation indisponibles." }, { status: 500 });
  }

  return NextResponse.json({ documents: [...pretrainingResources, ...visible, ...personalAttendanceResources, ...personalAssessmentResources, ...personalAssessmentEvidenceResources] });
}
