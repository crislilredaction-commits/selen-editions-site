import { NextResponse } from "next/server";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

const difficultiesHazardsDefaults = {
  purpose: "Anticiper les difficultés et aléas susceptibles de perturber une formation, prévoir une réponse proportionnée et conserver une trace des mesures prises lorsqu’elles ont un impact sur le parcours ou la qualité de la prestation.",
  steps: `Pour chaque difficulté ou aléa, l'organisme vérifie d'abord la situation, contacte les personnes concernées, choisit une solution adaptée puis trace l'action lorsqu'elle a un impact sur la formation. La liste ci-dessous constitue une base à adapter et à compléter selon l'activité de l'organisme.

Absence ou retard d'un apprenant — Prévention : rappeler les horaires et modalités de signalement. Solution : prendre contact, identifier le motif, proposer si nécessaire un rattrapage ou une adaptation et tracer le suivi.

Risque de décrochage ou d'abandon — Prévention : repérer les absences répétées, difficultés ou signaux faibles. Solution : organiser un échange, rechercher les causes, proposer une adaptation du parcours et formaliser les décisions.

Absence ou indisponibilité du formateur — Prévention : anticiper les indisponibilités connues et identifier une solution de remplacement lorsque cela est possible. Solution : informer rapidement les parties prenantes, mobiliser un remplaçant éligible ou replanifier la séquence.

Prérequis insuffisants ou difficulté pédagogique — Prévention : vérifier les prérequis et le positionnement en amont. Solution : adapter les modalités, proposer des ressources complémentaires, un accompagnement ou réorienter si la formation n'est pas adaptée.

Besoin d'accessibilité ou situation de handicap non anticipée — Prévention : recueillir les besoins avant l'entrée en formation et mobiliser le référent handicap. Solution : rechercher un aménagement raisonnable, solliciter les partenaires utiles et tracer l'adaptation retenue.

Incident technique, matériel ou connexion en distanciel — Prévention : tester les équipements et prévoir une solution de secours. Solution : assistance technique, changement de matériel ou de modalité, accès différé ou replanification selon l'impact.

Locaux indisponibles ou inadaptés — Prévention : confirmer la disponibilité et l'adéquation des locaux avant la session. Solution : mobiliser un autre lieu, passer en distanciel si pertinent ou replanifier en informant les participants.

Accident, problème de santé ou situation de sécurité — Prévention : communiquer les consignes et vérifier les conditions d'accueil. Solution : protéger les personnes, alerter les secours si nécessaire, interrompre la séquence concernée et enregistrer l'incident.

Conflit, comportement inadapté, violence, harcèlement ou discrimination — Prévention : rappeler le règlement et les canaux de signalement. Solution : faire cesser la situation, protéger les personnes, recueillir les faits et appliquer la procédure de signalement ou de réclamation appropriée.

Document, justificatif ou signature manquant — Prévention : contrôler le dossier avant les échéances et relancer en amont. Solution : demander la régularisation, renvoyer le document ou mettre en attente l'étape qui ne peut légalement ou contractuellement se poursuivre.

Difficulté ou anomalie d'évaluation — Prévention : préciser les consignes et vérifier les conditions d'évaluation. Solution : analyser l'anomalie, mettre en place l'adaptation autorisée, une nouvelle évaluation ou une replanification si nécessaire.

Insatisfaction ou réclamation — Prévention : faciliter l'expression des retours pendant et après la formation. Solution : accuser réception, analyser la situation, répondre, décider d'une action corrective si nécessaire et assurer le suivi.

Aléa externe ou cas de force majeure (transport, météo, indisponibilité d'un site, etc.) — Prévention : surveiller les événements prévisibles et préparer une solution alternative. Solution : informer sans délai, adapter la modalité ou replanifier la formation.

Après traitement, l'organisme vérifie si l'événement doit alimenter un incident, une réclamation, une adaptation, une action corrective ou l'amélioration continue.`,
  responsibilities: "La personne chargée du suivi de la session détecte ou centralise l'alerte. Le formateur traite ce qui relève de la pédagogie et signale tout événement ayant un impact sur le parcours. Le référent handicap intervient pour les besoins d'accessibilité. Le responsable de l'organisme arbitre les adaptations importantes, les replanifications et les suites à donner aux incidents ou réclamations.",
  evidence: "Selon la situation : échanges avec les personnes concernées, feuilles de présence, fiche de suivi de session, adaptation formalisée, incident ou réclamation, justificatifs, nouvelle planification, action corrective et décision d'amélioration continue.",
} as const;

const definitions = [
  { procedure_type: "learner_administration", title: "Parcours administratif de l’apprenant et remise des documents" },
  { procedure_type: "stakeholder_satisfaction", title: "Satisfaction des parties prenantes" },
  { procedure_type: "absence_dropout", title: "Prévention et gestion des absences et abandons" },
  {
    procedure_type: "difficulties_hazards",
    title: "Prévention des difficultés et aléas",
    ...difficultiesHazardsDefaults,
  },
] as const;
const allowedTypes = new Set(definitions.map((item) => item.procedure_type));

async function ensureProcedures(organisationId: string) {
  const admin = getAdminSupabase();
  const { error: upsertError } = await admin.from("daily_internal_procedures").upsert(
    definitions.map((item) => ({ organisation_id: organisationId, ...item })),
    { onConflict: "organisation_id,procedure_type", ignoreDuplicates: true },
  );
  if (upsertError) throw upsertError;
  const { data, error } = await admin
    .from("daily_internal_procedures")
    .select("id,procedure_type,title,purpose,steps,responsibilities,evidence,status,reviewed_at,updated_at")
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function GET() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  try {
    const procedures = await ensureProcedures(context.workspace.membership.organisation_id);
    return NextResponse.json({ procedures });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Procédures indisponibles." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.workspace.capabilities.legal_profile) {
    return NextResponse.json({ error: "Accès au profil de l’organisme requis." }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const procedureType = String(body.procedureType ?? "");
    if (!allowedTypes.has(procedureType as (typeof definitions)[number]["procedure_type"])) {
      return NextResponse.json({ error: "Type de procédure invalide." }, { status: 400 });
    }
    const status = String(body.status ?? "draft");
    if (!["draft", "active"].includes(status)) return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    const steps = String(body.steps ?? "").trim();
    if (!steps) {
      return NextResponse.json({ error: "Le déroulement de la procédure est requis." }, { status: 400 });
    }
    const definition = definitions.find((item) => item.procedure_type === procedureType)!;
    const now = new Date().toISOString();
    const values = {
      organisation_id: context.workspace.membership.organisation_id,
      procedure_type: procedureType,
      title: definition.title,
      purpose: String(body.purpose ?? "").trim() || null,
      steps,
      responsibilities: String(body.responsibilities ?? "").trim() || null,
      evidence: String(body.evidence ?? "").trim() || null,
      status,
      reviewed_at: status === "active" ? now : null,
      updated_at: now,
    };
    const { data, error } = await getAdminSupabase()
      .from("daily_internal_procedures")
      .upsert(values, { onConflict: "organisation_id,procedure_type" })
      .select("id,procedure_type,title,purpose,steps,responsibilities,evidence,status,reviewed_at,updated_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ procedure: data });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Enregistrement impossible." }, { status: 500 });
  }
}
