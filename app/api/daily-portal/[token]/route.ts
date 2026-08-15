import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };
type JsonRecord = Record<string, unknown>;

const learnerDocumentStatuses = ["validated", "published", "signed", "active"];

function cleanToken(value?: string | null) {
  return String(value ?? "").trim();
}

function normalizedEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function fullName(first?: unknown, last?: unknown) {
  return [first, last].map((value) => String(value ?? "").trim()).filter(Boolean).join(" ");
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as JsonRecord[] : [];
}

function portalRole(value: string) {
  if (value === "learner") return "apprenant";
  if (value === "enterprise") return "entreprise";
  return "formateur";
}

function isExpired(expiresAt?: string | null) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
}

function relatedLearner(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) return value[0] && typeof value[0] === "object" ? value[0] as JsonRecord : null;
  return value && typeof value === "object" ? value as JsonRecord : null;
}

async function loadLearnerDocuments(supabase: ReturnType<typeof getAdminSupabase>, access: JsonRecord, organisationId: string) {
  if (access.portal_type !== "learner") return [];
  const entityEmail = normalizedEmail(access.entity_email);
  if (!entityEmail) return [];

  const { data: enrolments, error: enrolmentError } = await supabase
    .from("daily_session_enrolments")
    .select("id,status,daily_learners(id,email)")
    .eq("session_id", access.session_id)
    .eq("organisation_id", organisationId)
    .not("status", "in", "(declined,cancelled)");
  if (enrolmentError) throw enrolmentError;

  const enrolment = (enrolments ?? []).find((row) => normalizedEmail(relatedLearner(row.daily_learners)?.email) === entityEmail);
  const enrolmentId = enrolment?.id ?? null;

  let query = supabase
    .from("daily_documents")
    .select("id,document_type,linked_object_type,linked_object_id,logical_name,version,status,mime_type,created_at")
    .eq("organisation_id", organisationId)
    .eq("is_current", true)
    .in("status", learnerDocumentStatuses)
    .in("document_type", ["training_program", "completion_certificate"])
    .order("created_at", { ascending: false });

  const { data: documents, error: documentError } = await query;
  if (documentError) throw documentError;

  return (documents ?? []).filter((document) => {
    if (document.document_type === "training_program") {
      return document.linked_object_type === "session" && document.linked_object_id === access.session_id;
    }
    return Boolean(
      enrolmentId
      && document.document_type === "completion_certificate"
      && document.linked_object_type === "enrolment"
      && document.linked_object_id === enrolmentId,
    );
  });
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const clean = cleanToken(token);
  if (!clean) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const supabase = getAdminSupabase();
  const { data: access, error: accessError } = await supabase
    .from("daily_portal_access_tokens")
    .select("*")
    .eq("token", clean)
    .maybeSingle();

  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 500 });
  if (!access) return NextResponse.json({ error: "Portail introuvable." }, { status: 404 });
  if (isExpired(access.expires_at)) {
    await supabase.from("daily_portal_access_tokens").update({ status: "expired" }).eq("id", access.id);
    return NextResponse.json({ error: "Ce lien de portail a expire." }, { status: 410 });
  }

  if (access.status === "pending") {
    await supabase
      .from("daily_portal_access_tokens")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", access.id);
  }

  const [
    { data: session, error: sessionError },
    { data: onboarding },
    { data: responses },
    { data: conventions },
    { data: trainers },
    { data: convocations },
  ] = await Promise.all([
    supabase
      .from("daily_sessions")
      .select("*, daily_formations(id,title,status,global_objective,target_audience,duration_hours,duration_days,modality)")
      .eq("id", access.session_id)
      .neq("status", "archived")
      .maybeSingle(),
    supabase
      .from("daily_onboarding")
      .select("organisation_name,platform_contact_first_name,platform_contact_last_name,platform_contact_email,address")
      .eq("user_id", access.user_id)
      .maybeSingle(),
    supabase
      .from("daily_registration_responses")
      .select("id,response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,need_answers,positioning_answers,adaptation_needed,submitted_at")
      .eq("session_id", access.session_id),
    supabase
      .from("daily_conventions")
      .select("id,recipient_type,recipient_key,recipient_name,recipient_email,company_name,version,document_name,generated_at,daily_convention_signatures(id,signatory_type,signatory_name,signatory_email,token,status,signed_at)")
      .eq("session_id", access.session_id),
    supabase
      .from("daily_trainers")
      .select("id,first_name,last_name,email")
      .eq("user_id", access.user_id),
    supabase
      .from("daily_convocations")
      .select("id,recipient_type,recipient_key,recipient_name,recipient_email,company_name,version,document_name,status,sent_at,generated_at")
      .eq("session_id", access.session_id),
  ]);

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  let learnerDocuments: JsonRecord[] = [];
  try {
    learnerDocuments = await loadLearnerDocuments(supabase, access, String(session.organisation_id ?? ""));
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Documents indisponibles." }, { status: 500 });
  }

  const responseRows = responses ?? [];
  const conventionRows = conventions ?? [];
  const entityEmail = normalizedEmail(access.entity_email);
  const entityName = String(access.entity_name ?? "").trim().toLowerCase();

  const individualLearners = asArray(session.individual_beneficiaries);
  const companyLearners = asArray(session.beneficiaries);
  const companies = asArray(session.companies);
  const learner = [...individualLearners, ...companyLearners].find((participant) => {
    const email = normalizedEmail(participant.email);
    const name = fullName(participant.first_name, participant.last_name).toLowerCase();
    return (entityEmail && email === entityEmail) || (entityName && name === entityName);
  }) ?? null;
  const company = companies.find((item) => {
    const email = normalizedEmail(item.email);
    const name = String(item.name ?? "").trim().toLowerCase();
    return (entityEmail && email === entityEmail) || (entityName && name === entityName);
  }) ?? null;

  const filteredResponses = access.portal_type === "learner"
    ? responseRows.filter((response) => normalizedEmail(response.respondent_email) === entityEmail)
    : access.portal_type === "enterprise"
      ? responseRows.filter((response) => {
          const companyName = String(response.company_name ?? "").trim().toLowerCase();
          return normalizedEmail(response.respondent_email) === entityEmail || (entityName && companyName === entityName);
        })
      : responseRows;

  const filteredConventions = access.portal_type === "learner"
    ? conventionRows.filter((convention) => {
        const email = normalizedEmail(convention.recipient_email);
        const name = String(convention.recipient_name ?? "").trim().toLowerCase();
        return convention.recipient_type === "beneficiary" && ((entityEmail && email === entityEmail) || (entityName && name === entityName));
      })
    : access.portal_type === "enterprise"
      ? conventionRows.filter((convention) => {
          const email = normalizedEmail(convention.recipient_email);
          const name = String(convention.company_name ?? "").trim().toLowerCase();
          return convention.recipient_type === "company" && ((entityEmail && email === entityEmail) || (entityName && name === entityName));
        })
      : [];
  const convocationRows = convocations ?? [];
  const filteredConvocations = access.portal_type === "learner"
    ? convocationRows.filter((convocation) => {
        const email = normalizedEmail(convocation.recipient_email);
        const name = String(convocation.recipient_name ?? "").trim().toLowerCase();
        return convocation.recipient_type === "beneficiary" && ((entityEmail && email === entityEmail) || (entityName && name === entityName));
      })
    : access.portal_type === "enterprise"
      ? convocationRows.filter((convocation) => {
          const email = normalizedEmail(convocation.recipient_email);
          const name = String(convocation.company_name ?? "").trim().toLowerCase();
          return convocation.recipient_type === "company" && ((entityEmail && email === entityEmail) || (entityName && name === entityName));
        })
      : convocationRows.filter((convocation) => convocation.recipient_type === "trainer");

  return NextResponse.json({
    access: {
      portalType: access.portal_type,
      roleLabel: portalRole(access.portal_type),
      entityName: access.entity_name,
      entityEmail: access.entity_email,
      viewedAt: access.viewed_at,
    },
    session,
    onboarding,
    learner,
    company,
    companies: access.portal_type === "trainer" ? companies : company ? [company] : [],
    participants: access.portal_type === "enterprise"
      ? asArray(company?.participants)
      : access.portal_type === "trainer"
        ? [...individualLearners, ...companyLearners, ...companies.flatMap((item) => asArray(item.participants))]
        : learner ? [learner] : [],
    trainers: trainers ?? [],
    responses: filteredResponses,
    conventions: filteredConventions,
    convocations: filteredConvocations,
    documents: learnerDocuments,
  });
}