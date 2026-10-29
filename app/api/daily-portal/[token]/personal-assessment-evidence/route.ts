import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { isActivePortalAttendanceToken } from "@/lib/daily/portalAttendanceAccess.mjs";
import { isPostsessionDownloadAvailable, personalSignatureStorageObjectPath } from "@/lib/server/dailyPersonalAttendance";
import { isFinalAssessmentResult } from "@/lib/server/dailyPersonalAssessment";
import { findUniqueDailyLearnerPortalEnrolment, matchesDailyLearnerPortalAccess } from "@/lib/server/dailyPortalLearnerIdentity";

type Params = { params: Promise<{ token: string }> };
const text = (value: unknown) => String(value ?? "").trim();

export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  const cleanToken = text(token);
  const documentId = text(new URL(request.url).searchParams.get("document"));
  if (!cleanToken || !documentId) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const admin = getAdminSupabase();
  const { data: access, error: accessError } = await admin.from("daily_portal_access_tokens").select("session_id,portal_type,entity_key,entity_name,entity_email,status,expires_at").eq("token", cleanToken).maybeSingle();
  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 500 });
  if (!access || access.portal_type !== "learner") return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  if (!["pending", "viewed"].includes(text(access.status))) return NextResponse.json({ error: "Cet accès n’est plus actif." }, { status: 403 });
  if (!isActivePortalAttendanceToken(access.status, access.expires_at)) return NextResponse.json({ error: "Ce lien a expiré." }, { status: 410 });

  const { data: session, error: sessionError } = await admin.from("daily_sessions").select("id,organisation_id,end_date").eq("id", access.session_id).neq("status", "archived").maybeSingle();
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session || !isPostsessionDownloadAvailable(session.end_date)) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  const { data: evidence, error: evidenceError } = await admin.from("daily_documents").select("id,organisation_id,session_id,enrolment_id,learner_id,linked_object_type,linked_object_id,bucket,storage_path,logical_name").eq("id", documentId).eq("organisation_id", session.organisation_id).eq("session_id", session.id).eq("document_type", "learning_assessment_evidence").eq("is_current", true).is("archived_at", null).maybeSingle();
  if (evidenceError) return NextResponse.json({ error: evidenceError.message }, { status: 500 });
  if (!evidence || evidence.linked_object_type !== "enrolment" || text(evidence.linked_object_id) !== text(evidence.enrolment_id)) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  const { data: enrolment, error: enrolmentError } = await admin.from("daily_session_enrolments").select("id,organisation_id,session_id,learner_id,status,daily_learners(email)").eq("id", evidence.enrolment_id).eq("organisation_id", session.organisation_id).eq("session_id", session.id).not("status", "in", "(declined,cancelled,abandoned)").maybeSingle();
  if (enrolmentError) return NextResponse.json({ error: enrolmentError.message }, { status: 500 });
  if (!enrolment || text(enrolment.learner_id) !== text(evidence.learner_id) || enrolment.organisation_id !== session.organisation_id) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  if (!matchesDailyLearnerPortalAccess(access, enrolment)) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  // Check every enrolment in this OF/session, including cancelled ones.
  // A legacy email-only link must never authorize a different learner's private evidence.
  const { data: sessionEnrolments, error: scopeError } = await admin
    .from("daily_session_enrolments")
    .select("id,learner_id,status,daily_learners(email)")
    .eq("organisation_id", session.organisation_id)
    .eq("session_id", session.id);
  if (scopeError) return NextResponse.json({ error: scopeError.message }, { status: 500 });
  if (findUniqueDailyLearnerPortalEnrolment(access, sessionEnrolments ?? [])?.id !== enrolment.id)
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });


  const { data: assessment, error: assessmentError } = await admin.from("daily_learning_assessments").select("outcome,assessed_at").eq("organisation_id", session.organisation_id).eq("session_id", session.id).eq("enrolment_id", enrolment.id).maybeSingle();
  if (assessmentError) return NextResponse.json({ error: assessmentError.message }, { status: 500 });
  if (!assessment || !isFinalAssessmentResult(assessment.outcome, assessment.assessed_at)) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  const storagePath = personalSignatureStorageObjectPath(evidence.storage_path, session.organisation_id);
  if (evidence.bucket !== "documents" || !storagePath) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

  const { data: signed, error: signedError } = await admin.storage.from("documents").createSignedUrl(storagePath, 120, { download: text(evidence.logical_name) || true });
  if (signedError || !signed?.signedUrl) return NextResponse.json({ error: "Téléchargement indisponible." }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
