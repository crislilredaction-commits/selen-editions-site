import { NextResponse } from "next/server";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

type ActionItem = {
  id: string;
  kind: "dossier" | "positioning" | "prerequisite" | "adaptation" | "trainer" | "application";
  priority: "high" | "medium" | "normal";
  title: string;
  detail: string;
  href: string;
  sessionId?: string | null;
  sessionLabel?: string | null;
};

type FormationRelation = { title?: string | null; organisation_id?: string | null };
type LearnerRelation = { first_name?: string | null; last_name?: string | null };
type SessionRelation = {
  id?: string | null;
  internal_reference?: string | null;
  status?: string | null;
  daily_formations?: FormationRelation | FormationRelation[] | null;
};

type EnrolmentRelation = {
  id?: string | null;
  session_id?: string | null;
  status?: string | null;
  daily_learners?: LearnerRelation | LearnerRelation[] | null;
  daily_sessions?: SessionRelation | SessionRelation[] | null;
};

type PublicApplicationRelation = {
  id: string;
  formation_id: string;
  response_type: string;
  respondent_first_name?: string | null;
  respondent_last_name?: string | null;
  respondent_email?: string | null;
  company_name?: string | null;
  attached_session_id?: string | null;
  daily_formations?: FormationRelation | FormationRelation[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function sessionLabel(session: SessionRelation | null | undefined) {
  const formation = one(session?.daily_formations);
  return session?.internal_reference || formation?.title || "Session";
}

function learnerLabel(enrolment: EnrolmentRelation) {
  const learner = one(enrolment.daily_learners);
  const label = [learner?.first_name, learner?.last_name].filter(Boolean).join(" ").trim();
  return label || "Apprenant";
}

function applicantLabel(application: PublicApplicationRelation) {
  if (application.response_type === "company" && application.company_name?.trim()) {
    return application.company_name.trim();
  }
  const name = [application.respondent_first_name, application.respondent_last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || application.respondent_email || "Candidat";
}

export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["sessions", "trainings"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const [
    { data: sessions, error: sessionsError },
    { data: checklist, error: checklistError },
    { data: enrolments, error: enrolmentsError },
    { data: supportNeeds, error: needsError },
    { data: publicApplications, error: applicationsError },
  ] = await Promise.all([
    context.admin
      .from("daily_sessions")
      .select("id,internal_reference,start_date,end_date,status,trainer_ids,daily_formations(title)")
      .eq("organisation_id", context.organisationId)
      .neq("status", "archived")
      .order("start_date", { ascending: true }),
    context.admin
      .from("daily_session_checklist_items")
      .select("id,session_id,label,status,responsibility,due_at,note")
      .eq("organisation_id", context.organisationId)
      .neq("responsibility", "selen"),
    context.admin
      .from("daily_session_enrolments")
      .select("id,session_id,status,positioning_status,prerequisites_status,daily_learners(first_name,last_name),daily_sessions(id,internal_reference,start_date,end_date,status,daily_formations(title))")
      .eq("organisation_id", context.organisationId)
      .not("status", "in", "(cancelled,declined,completed)"),
    context.admin
      .from("daily_enrolment_support_needs")
      .select("id,enrolment_id,has_specific_needs,needs_description,planned_accommodations,contact_requested,daily_session_enrolments(id,session_id,status,daily_learners(first_name,last_name),daily_sessions(id,internal_reference,start_date,end_date,status,daily_formations(title)))")
      .eq("organisation_id", context.organisationId)
      .eq("has_specific_needs", true),
    context.admin
      .from("daily_formation_registration_requests")
      .select("id,formation_id,response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,attached_session_id,daily_formations!inner(title,organisation_id)")
      .eq("status", "to_attach")
      .is("attached_session_id", null)
      .eq("daily_formations.organisation_id", context.organisationId)
      .order("submitted_at", { ascending: true }),
  ]);

  const error = sessionsError ?? checklistError ?? enrolmentsError ?? needsError ?? applicationsError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actions: ActionItem[] = [];
  const sessionsById = new Map((sessions ?? []).map((session) => [session.id, session]));

  for (const item of checklist ?? []) {
    if (!["todo", "in_progress", "blocked"].includes(item.status)) continue;
    const rawSession = sessionsById.get(item.session_id);
    if (!rawSession) continue;
    const session = rawSession as SessionRelation;
    actions.push({
      id: `dossier:${item.id}`,
      kind: "dossier",
      priority: item.status === "blocked" ? "high" : item.due_at && new Date(item.due_at).getTime() < Date.now() ? "high" : "normal",
      title: item.label,
      detail: item.status === "blocked" ? (item.note || "Ce point bloque actuellement le dossier de session.") : "Ce point du dossier attend une action de votre organisme.",
      href: "/client/daily/dossiers",
      sessionId: item.session_id,
      sessionLabel: sessionLabel(session),
    });
  }

  for (const enrolment of enrolments ?? []) {
    const enrolmentRelation = enrolment as EnrolmentRelation & { positioning_status?: string | null; prerequisites_status?: string | null };
    const session = one(enrolmentRelation.daily_sessions);
    if (!session || session.status === "archived") continue;
    const learner = learnerLabel(enrolmentRelation);
    const label = sessionLabel(session);

    if (enrolmentRelation.positioning_status !== "reviewed") {
      actions.push({
        id: `positioning:${enrolment.id}`,
        kind: "positioning",
        priority: enrolmentRelation.positioning_status === "submitted" ? "medium" : "normal",
        title: `Positionnement de ${learner}`,
        detail: enrolmentRelation.positioning_status === "submitted" ? "Le positionnement a été reçu et doit être relu." : "Le positionnement n'est pas encore finalisé.",
        href: "/client/daily/apprenants",
        sessionId: enrolment.session_id,
        sessionLabel: label,
      });
    }

    if (enrolmentRelation.prerequisites_status !== "met") {
      const priority = enrolmentRelation.prerequisites_status === "not_met" ? "high" : enrolmentRelation.prerequisites_status === "to_clarify" ? "medium" : "normal";
      actions.push({
        id: `prerequisite:${enrolment.id}`,
        kind: "prerequisite",
        priority,
        title: `Prérequis de ${learner}`,
        detail: enrolmentRelation.prerequisites_status === "not_met" ? "Les prérequis sont signalés comme non satisfaits." : enrolmentRelation.prerequisites_status === "to_clarify" ? "Un point doit être clarifié sur les prérequis." : "Les prérequis doivent encore être vérifiés.",
        href: "/client/daily/apprenants",
        sessionId: enrolment.session_id,
        sessionLabel: label,
      });
    }
  }

  for (const need of supportNeeds ?? []) {
    const enrolment = one(need.daily_session_enrolments as EnrolmentRelation | EnrolmentRelation[] | null);
    if (!enrolment || ["cancelled", "declined", "completed"].includes(enrolment.status ?? "")) continue;
    const session = one(enrolment.daily_sessions);
    if (!session || session.status === "archived") continue;
    if (need.planned_accommodations && !need.contact_requested) continue;
    const learner = learnerLabel(enrolment);
    actions.push({
      id: `adaptation:${need.id}`,
      kind: "adaptation",
      priority: "high",
      title: `Adaptation à préparer pour ${learner}`,
      detail: need.contact_requested ? "Un contact a été demandé pour préciser les besoins d'adaptation." : (need.needs_description || "Un besoin spécifique est signalé et les aménagements restent à préciser."),
      href: "/client/daily/apprenants",
      sessionId: enrolment.session_id,
      sessionLabel: sessionLabel(session),
    });
  }

  for (const rawSession of sessions ?? []) {
    const trainerIds = Array.isArray(rawSession.trainer_ids) ? rawSession.trainer_ids.filter(Boolean) : [];
    if (trainerIds.length > 0) continue;
    const session = rawSession as SessionRelation;
    actions.push({
      id: `trainer:${rawSession.id}`,
      kind: "trainer",
      priority: "medium",
      title: "Formateur à associer",
      detail: "Cette session n'a pas encore de formateur associé.",
      href: "/client/daily/sessions",
      sessionId: rawSession.id,
      sessionLabel: sessionLabel(session),
    });
  }

  for (const rawApplication of publicApplications ?? []) {
    const application = rawApplication as unknown as PublicApplicationRelation;
    const formation = one(application.daily_formations);
    actions.push({
      id: `application:${application.id}`,
      kind: "application",
      priority: "medium",
      title: `Session à proposer pour ${applicantLabel(application)}`,
      detail: "Une candidature a été reçue depuis votre lien public alors qu'aucune session n'était disponible. Créez ou préparez une session ; Selen conservera le contrôle du dossier avant convention.",
      href: `/client/daily/sessions?formation_id=${encodeURIComponent(application.formation_id)}`,
      sessionLabel: formation?.title || "Formation",
    });
  }

  const rank = { high: 0, medium: 1, normal: 2 } as const;
  actions.sort((a, b) => rank[a.priority] - rank[b.priority] || (a.sessionLabel ?? "").localeCompare(b.sessionLabel ?? "", "fr"));

  return NextResponse.json({
    actions,
    counts: {
      total: actions.length,
      high: actions.filter((item) => item.priority === "high").length,
      dossier: actions.filter((item) => item.kind === "dossier").length,
      learners: actions.filter((item) => ["positioning", "prerequisite", "adaptation"].includes(item.kind)).length,
      trainers: actions.filter((item) => item.kind === "trainer").length,
      applications: actions.filter((item) => item.kind === "application").length,
    },
  });
}
