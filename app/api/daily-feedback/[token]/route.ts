import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { hashDailyFeedbackToken } from "@/lib/server/dailyEndEvaluations";

type Params = { params: Promise<{ token: string }> };

function rating(value: unknown, required = false) {
  if (value === null || value === undefined || String(value).trim() === "") return required ? null : undefined;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

function text(body: Record<string, unknown>, key: string, max = 4000) {
  return String(body[key] ?? "").trim().slice(0, max) || null;
}

function formationTitle(value: unknown) {
  if (Array.isArray(value)) return value[0]?.title ?? "Formation Selen Daily";
  if (value && typeof value === "object" && "title" in value) return String((value as { title?: unknown }).title ?? "Formation Selen Daily");
  return "Formation Selen Daily";
}

async function loadToken(rawToken: string) {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("daily_learner_feedback_tokens")
    .select("id,organisation_id,session_id,enrolment_id,status,expires_at,last_used_at")
    .eq("token_hash", hashDailyFeedbackToken(rawToken))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { admin, token: data } : null;
}

function unavailable(token: { status: string; expires_at: string }) {
  return !["active", "submitted"].includes(token.status) || new Date(token.expires_at).getTime() < Date.now();
}

export async function GET(_request: Request, { params }: Params) {
  const { token: raw } = await params;
  const rawToken = String(raw ?? "").trim();
  if (!rawToken) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  try {
    const loaded = await loadToken(rawToken);
    if (!loaded) return NextResponse.json({ error: "Lien de satisfaction introuvable." }, { status: 404 });
    const { admin, token } = loaded;
    if (unavailable(token)) return NextResponse.json({ error: "Ce lien de satisfaction n'est plus actif." }, { status: 410 });
    const [{ data: session }, { data: enrolment }, { data: response }] = await Promise.all([
      admin.from("daily_sessions").select("id,start_date,end_date,daily_formations(id,title)").eq("id", token.session_id).eq("organisation_id", token.organisation_id).maybeSingle(),
      admin.from("daily_session_enrolments").select("id,status,daily_learners(id,first_name,last_name)").eq("id", token.enrolment_id).eq("session_id", token.session_id).eq("organisation_id", token.organisation_id).maybeSingle(),
      admin.from("daily_learner_feedback_responses").select("submitted_at").eq("session_id", token.session_id).eq("enrolment_id", token.enrolment_id).maybeSingle(),
    ]);
    if (!session || !enrolment || ["cancelled", "declined"].includes(enrolment.status)) return NextResponse.json({ error: "Cette inscription n'est plus active." }, { status: 410 });
    await admin.from("daily_learner_feedback_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", token.id);
    const learner = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
    return NextResponse.json({
      session: { title: formationTitle(session.daily_formations), startDate: session.start_date, endDate: session.end_date },
      learner: { firstName: learner?.first_name ?? "", lastName: learner?.last_name ?? "" },
      alreadySubmitted: Boolean(response),
      submittedAt: response?.submitted_at ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ouverture impossible." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { token: raw } = await params;
  const rawToken = String(raw ?? "").trim();
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!rawToken) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  try {
    const loaded = await loadToken(rawToken);
    if (!loaded) return NextResponse.json({ error: "Lien de satisfaction introuvable." }, { status: 404 });
    const { admin, token } = loaded;
    if (unavailable(token)) return NextResponse.json({ error: "Ce lien de satisfaction n'est plus actif." }, { status: 410 });
    const { data: existing } = await admin.from("daily_learner_feedback_responses").select("id,submitted_at").eq("session_id", token.session_id).eq("enrolment_id", token.enrolment_id).maybeSingle();
    if (existing) return NextResponse.json({ ok: true, alreadySubmitted: true, submittedAt: existing.submitted_at });

    const overall = rating(body.overall_rating, true);
    const objectives = rating(body.objectives_rating, true);
    const trainer = rating(body.trainer_rating);
    const organisation = rating(body.organisation_rating);
    const content = rating(body.content_rating);
    const pace = rating(body.pace_rating);
    if (overall === null || objectives === null || trainer === null || organisation === null || content === null || pace === null) {
      return NextResponse.json({ error: "Les notes doivent être comprises entre 1 et 5." }, { status: 400 });
    }
    const submittedAt = new Date().toISOString();
    const { error } = await admin.from("daily_learner_feedback_responses").insert({
      organisation_id: token.organisation_id,
      session_id: token.session_id,
      enrolment_id: token.enrolment_id,
      overall_rating: overall,
      objectives_rating: objectives,
      trainer_rating: trainer,
      organisation_rating: organisation,
      content_rating: content,
      pace_rating: pace,
      would_recommend: typeof body.would_recommend === "boolean" ? body.would_recommend : null,
      strengths: text(body, "strengths"),
      improvements: text(body, "improvements"),
      adaptation_feedback: text(body, "adaptation_feedback"),
      free_comment: text(body, "free_comment"),
      submitted_at: submittedAt,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.from("daily_learner_feedback_tokens").update({ status: "submitted", last_used_at: submittedAt }).eq("id", token.id);

    const [{ data: active }, { data: assessments }, { data: responses }] = await Promise.all([
      admin.from("daily_session_enrolments").select("id,status").eq("organisation_id", token.organisation_id).eq("session_id", token.session_id).not("status", "in", "(cancelled,declined)"),
      admin.from("daily_learning_assessments").select("enrolment_id,outcome").eq("organisation_id", token.organisation_id).eq("session_id", token.session_id),
      admin.from("daily_learner_feedback_responses").select("enrolment_id").eq("organisation_id", token.organisation_id).eq("session_id", token.session_id),
    ]);
    const assessmentMap = new Map((assessments ?? []).map((row) => [row.enrolment_id, row.outcome]));
    const feedbackSet = new Set((responses ?? []).map((row) => row.enrolment_id));
    const complete = (active ?? []).length > 0 && (active ?? []).every((row) => assessmentMap.get(row.id) && assessmentMap.get(row.id) !== "pending" && feedbackSet.has(row.id));
    await admin.from("daily_session_checklist_items").update({ status: complete ? "to_review" : "in_progress" }).eq("organisation_id", token.organisation_id).eq("session_id", token.session_id).eq("item_key", "end_evaluations").neq("status", "not_applicable");
    return NextResponse.json({ ok: true, submittedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Enregistrement impossible." }, { status: 500 });
  }
}
