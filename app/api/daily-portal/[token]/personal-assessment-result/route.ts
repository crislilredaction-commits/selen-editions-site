import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { buildPersonalAssessmentResultHtml } from "@/lib/server/dailyPosttrainingDocumentHtml";
import { assessmentOutcomeLabel, isFinalAssessmentResult } from "@/lib/server/dailyPersonalAssessment";
import { isPostsessionDownloadAvailable, safePersonalDownloadName } from "@/lib/server/dailyPersonalAttendance";
import { matchesDailyLearnerPortalAccess } from "@/lib/server/dailyPortalLearnerIdentity";

type Params = { params: Promise<{ token: string }> };
type Json = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
const one = (value: unknown): Json => Array.isArray(value) ? (value[0] as Json | undefined) ?? {} : value && typeof value === "object" ? value as Json : {};

function isExpired(value: unknown) {
  const expiresAt = text(value);
  return Boolean(expiresAt && Date.parse(expiresAt) < Date.now());
}

export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  const enrolmentId = new URL(request.url).searchParams.get("enrolment") ?? "";
  if (!text(token) || !enrolmentId) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const admin = getAdminSupabase();
  const { data: access, error: accessError } = await admin
    .from("daily_portal_access_tokens")
    .select("session_id,portal_type,entity_key,entity_name,entity_email,status,expires_at")
    .eq("token", text(token))
    .maybeSingle();
  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 500 });
  if (!access || access.portal_type !== "learner") return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  if (["revoked", "expired"].includes(text(access.status))) return NextResponse.json({ error: "Cet accès n’est plus actif." }, { status: 403 });
  if (isExpired(access.expires_at)) return NextResponse.json({ error: "Ce lien de portail a expiré." }, { status: 410 });

  const [{ data: session, error: sessionError }, { data: enrolment, error: enrolmentError }] = await Promise.all([
    admin.from("daily_sessions").select("id,organisation_id,internal_reference,start_date,end_date,status,daily_formations(title)").eq("id", access.session_id).neq("status", "archived").maybeSingle(),
    admin.from("daily_session_enrolments").select("id,learner_id,organisation_id,session_id,status,daily_learners(first_name,last_name,email)").eq("id", enrolmentId).eq("session_id", access.session_id).not("status", "in", "(declined,cancelled,abandoned)").maybeSingle(),
  ]);
  const readError = sessionError ?? enrolmentError;
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!session || !enrolment || enrolment.organisation_id !== session.organisation_id) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  const learner = one(enrolment.daily_learners);
  if (!matchesDailyLearnerPortalAccess(access, enrolment)) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  if (!isPostsessionDownloadAvailable(session.end_date)) return NextResponse.json({ error: "Le résultat personnel sera disponible après la fin de la session." }, { status: 409 });

  const [{ data: assessment, error: assessmentError }, { data: organisation, error: organisationError }] = await Promise.all([
    admin.from("daily_learning_assessments").select("outcome,score,score_max,method,assessed_at").eq("organisation_id", session.organisation_id).eq("session_id", session.id).eq("enrolment_id", enrolment.id).maybeSingle(),
    admin.from("organisations").select("name,legal_name,siret,nda_number").eq("id", session.organisation_id).maybeSingle(),
  ]);
  const resultError = assessmentError ?? organisationError;
  if (resultError) return NextResponse.json({ error: resultError.message }, { status: 500 });
  if (!assessment || !isFinalAssessmentResult(assessment.outcome, assessment.assessed_at)) return NextResponse.json({ error: "Le résultat personnel sera disponible lorsque l’évaluation aura été finalisée." }, { status: 409 });

  const learnerName = [text(learner.first_name), text(learner.last_name)].filter(Boolean).join(" ") || text(learner.email).toLowerCase() || "Apprenant";
  const formation = one(session.daily_formations);
  const html = buildPersonalAssessmentResultHtml({
    organisationName: text(organisation?.legal_name || organisation?.name) || "Organisme de formation",
    organisationSiret: text(organisation?.siret),
    organisationNda: text(organisation?.nda_number),
    formationTitle: text(formation.title) || "Formation",
    sessionReference: text(session.internal_reference),
    learnerName,
    startDate: text(session.start_date),
    endDate: text(session.end_date),
    outcomeLabel: assessmentOutcomeLabel(assessment.outcome),
    score: typeof assessment.score === "number" ? assessment.score : null,
    scoreMax: typeof assessment.score_max === "number" ? assessment.score_max : null,
    method: text(assessment.method) || null,
    assessedAt: text(assessment.assessed_at),
    generatedAt: new Date(),
  });
  const filename = safePersonalDownloadName(`resultat-evaluation-finale-${learnerName}`);
  return new NextResponse(html, { status: 200, headers: {
    "Content-Type": "application/msword; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
