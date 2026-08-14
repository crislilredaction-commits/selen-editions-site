import { NextResponse } from "next/server";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

type ActionItem = {
  id: string;
  kind: "dossier" | "positioning" | "prerequisite" | "adaptation" | "trainer";
  priority: "high" | "medium" | "normal";
  title: string;
  detail: string;
  href: string;
  sessionId?: string | null;
  sessionLabel?: string | null;
};

function sessionLabel(session: { internal_reference?: string | null; daily_formations?: { title?: string | null } | null } | null | undefined) {
  return session?.internal_reference || session?.daily_formations?.title || "Session";
}

function learnerLabel(enrolment: { daily_learners?: { first_name?: string | null; last_name?: string | null } | null }) {
  const learner = enrolment.daily_learners;
  const label = [learner?.first_name, learner?.last_name].filter(Boolean).join(" ").trim();
  return label || "Apprenant";
}

export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["sessions", "trainings"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const [{ data: sessions, error: sessionsError }, { data: checklist, error: checklistError }, { data: enrolments, error: enrolmentsError }, { data: supportNeeds, error: needsError }] = await Promise.all([
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
  ]);

  const error = sessionsError ?? checklistError ?? enrolmentsError ?? needsError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actions: ActionItem[] = [];
  const sessionsById = new Map((sessions ?? []).map((session) => [session.id, session]));

  for (const item of checklist ?? []) {
    if (!["todo", "in_progress", "blocked"].includes(item.status)) continue;
    const session = sessionsById.get(item.session_id);
    if (!session) continue;
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
    const session = enrolment.daily_sessions;
    if (!session || session.status === "archived") continue;
    const learner = learnerLabel(enrolment);
    const label = sessionLabel(session);

    if (!["reviewed"].includes(enrolment.positioning_status ?? "not_started")) {
      actions.push({
        id: `positioning:${enrolment.id}`,
        kind: "positioning",
        priority: enrolment.positioning_status === "submitted" ? "medium" : "normal",
        title: `Positionnement de ${learner}`,
        detail: enrolment.positioning_status === "submitted" ? "Le positionnement a été reçu et doit être relu." : "Le positionnement n'est pas encore finalisé.",
        href: "/client/daily/apprenants",
        sessionId: enrolment.session_id,
        sessionLabel: label,
      });
    }

    if (!["met"].includes(enrolment.prerequisites_status ?? "not_reviewed")) {
      const priority = enrolment.prerequisites_status === "not_met" ? "high" : enrolment.prerequisites_status === "to_clarify" ? "medium" : "normal";
      actions.push({
        id: `prerequisite:${enrolment.id}`,
        kind: "prerequisite",
        priority,
        title: `Prérequis de ${learner}`,
        detail: enrolment.prerequisites_status === "not_met" ? "Les prérequis sont signalés comme non satisfaits." : enrolment.prerequisites_status === "to_clarify" ? "Un point doit être clarifié sur les prérequis." : "Les prérequis doivent encore être vérifiés.",
        href: "/client/daily/apprenants",
        sessionId: enrolment.session_id,
        sessionLabel: label,
      });
    }
  }

  for (const need of supportNeeds ?? []) {
    const enrolment = need.daily_session_enrolments;
    if (!enrolment || ["cancelled", "declined", "completed"].includes(enrolment.status)) continue;
    const session = enrolment.daily_sessions;
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

  for (const session of sessions ?? []) {
    const trainerIds = Array.isArray(session.trainer_ids) ? session.trainer_ids.filter(Boolean) : [];
    if (trainerIds.length > 0) continue;
    actions.push({
      id: `trainer:${session.id}`,
      kind: "trainer",
      priority: "medium",
      title: "Formateur à associer",
      detail: "Cette session n'a pas encore de formateur associé.",
      href: "/client/daily/sessions",
      sessionId: session.id,
      sessionLabel: sessionLabel(session),
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
    },
  });
}
