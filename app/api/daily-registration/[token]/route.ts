import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import {
  buildDailyRegistrationSummary,
  DAILY_COMPANY_QUESTIONS,
  DAILY_NEED_QUESTIONS,
  DAILY_POSITIONING_QUESTIONS,
  detectAdaptationNeeded,
} from "@/lib/dailyRegistration";

type Params = { params: Promise<{ token: string }> };

const FORMATION_PUBLIC_FIELDS = [
  "id",
  "title",
  "status",
  "global_objective",
  "target_audience",
  "prerequisites",
  "duration_hours",
  "duration_days",
  "modality",
  "modality_details",
  "access_delays",
  "registration_methods",
  "price",
  "detailed_program",
  "detailed_program_document_url",
  "accessibility",
  "pedagogical_resources",
  "pedagogical_methods",
  "evaluation_methods",
  "positioning_mode",
  "positioning_questions",
].join(",");

function cleanToken(value?: string | null) {
  return String(value ?? "").trim();
}

function text(body: Record<string, unknown>, key: string) {
  return String(body[key] ?? "").trim();
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function hasExplicitAdaptationAnswer(answers: Record<string, unknown>) {
  return String(
    answers.adaptation_needed_answer ?? answers.company_adaptation_needed ?? "",
  ).toLowerCase() === "oui";
}

async function findSession(token: string) {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("daily_sessions")
    .select(
      `id,user_id,registration_token,registration_status,adaptation_needed,companies,beneficiaries,individual_beneficiaries,daily_formations(${FORMATION_PUBLIC_FIELDS})`,
    )
    .eq("registration_token", token)
    .neq("status", "archived")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function findFormation(token: string) {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("daily_formations")
    .select(`user_id,public_registration_token,public_registration_enabled,${FORMATION_PUBLIC_FIELDS}`)
    .eq("public_registration_token", token)
    .eq("public_registration_enabled", true)
    .neq("status", "archived")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const clean = cleanToken(token);
  if (!clean) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const session = await findSession(clean);
  if (session) {
    return NextResponse.json({
      registrationKind: "session",
      session,
      beneficiaryQuestions: DAILY_NEED_QUESTIONS,
      companyQuestions: DAILY_COMPANY_QUESTIONS,
      positioningQuestions: DAILY_POSITIONING_QUESTIONS,
    });
  }

  const formation = await findFormation(clean);
  if (!formation) return NextResponse.json({ error: "Lien introuvable ou expiré." }, { status: 404 });

  return NextResponse.json({
    registrationKind: "formation",
    session: {
      id: null,
      user_id: formation.user_id,
      registration_token: null,
      registration_status: "spontaneous",
      daily_formations: formation,
    },
    beneficiaryQuestions: DAILY_NEED_QUESTIONS,
    companyQuestions: DAILY_COMPANY_QUESTIONS,
    positioningQuestions: DAILY_POSITIONING_QUESTIONS,
  });
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const clean = cleanToken(token);
  if (!clean) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const responseType = text(body, "response_type");
  if (!["beneficiary", "company"].includes(responseType)) {
    return NextResponse.json({ error: "Type de dossier invalide." }, { status: 400 });
  }

  const session = await findSession(clean);
  const formation = session ? null : await findFormation(clean);
  if (!session && !formation) return NextResponse.json({ error: "Lien introuvable ou expiré." }, { status: 404 });

  const needAnswers = jsonObject(body.need_answers);
  const positioningAnswers = jsonObject(body.positioning_answers);
  const adaptationNeeded = hasExplicitAdaptationAnswer(needAnswers) || detectAdaptationNeeded(needAnswers);
  const supabase = getAdminSupabase();

  if (formation) {
    const { data: response, error } = await supabase
      .from("daily_formation_registration_requests")
      .insert({
        formation_id: formation.id,
        user_id: formation.user_id,
        response_type: responseType,
        respondent_first_name: text(body, "respondent_first_name") || null,
        respondent_last_name: text(body, "respondent_last_name") || null,
        respondent_email: text(body, "respondent_email").toLowerCase() || null,
        company_name: responseType === "company" ? text(body, "company_name") || null : null,
        participants: responseType === "company" ? jsonArray(body.participants) : [],
        need_answers: needAnswers,
        positioning_answers: positioningAnswers,
        adaptation_needed: adaptationNeeded,
        status: "to_attach",
        submitted_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase
      .from("daily_formations")
      .update({ spontaneous_registration_task_status: "to_attach" })
      .eq("id", formation.id);

    return NextResponse.json({
      response,
      summary: {
        task: "Créer une session ou rattacher cette demande à une session.",
      },
      registrationKind: "formation",
    });
  }

  if (!session) {
    return NextResponse.json({ error: "Lien introuvable ou expiré." }, { status: 404 });
  }

  const { data: response, error } = await supabase
    .from("daily_registration_responses")
    .insert({
      session_id: session.id,
      user_id: session.user_id,
      response_type: responseType,
      respondent_first_name: text(body, "respondent_first_name") || null,
      respondent_last_name: text(body, "respondent_last_name") || null,
      respondent_email: text(body, "respondent_email").toLowerCase() || null,
      company_name: responseType === "company" ? text(body, "company_name") || null : null,
      participants: responseType === "company" ? jsonArray(body.participants) : [],
      need_answers: needAnswers,
      positioning_answers: positioningAnswers,
      adaptation_needed: adaptationNeeded,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: responses } = await supabase
    .from("daily_registration_responses")
    .select("response_type,respondent_first_name,respondent_last_name,company_name,need_answers,positioning_answers,adaptation_needed")
    .eq("session_id", session.id)
    .eq("status", "submitted");

  const summary = buildDailyRegistrationSummary(responses ?? []);
  const hasAdaptation = Boolean(session.adaptation_needed) || adaptationNeeded || summary.adaptation_needed;

  await supabase
    .from("daily_sessions")
    .update({
      registration_status: "summary_to_review",
      registration_summary: summary,
      adaptation_needed: hasAdaptation,
      registration_responses_received_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  return NextResponse.json({ response, summary });
}
