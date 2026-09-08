export type QualiopiActivity = "training" | "skills_assessment" | "vae" | "apprenticeship";

export type QualiopiNovember2026Indicator = {
  number: 12 | 19 | 27 | 32 | 33;
  appliesTo: readonly QualiopiActivity[];
  summary: string;
  implementationFocus: readonly string[];
};

export const QUALIOPI_NOVEMBER_2026_EFFECTIVE_ON = "2026-11-01";
export const QUALIOPI_NOVEMBER_2026_DECREE = "Décret n° 2026-728 du 1er août 2026";
export const QUALIOPI_NOVEMBER_2026_SOURCE =
  "https://www.legifrance.gouv.fr/eli/decret/2026/8/1/2026-728/jo/texte";

const ALL_ACTIVITIES = ["training", "skills_assessment", "vae", "apprenticeship"] as const;

export const QUALIOPI_NOVEMBER_2026_FOCUS: readonly QualiopiNovember2026Indicator[] = [
  {
    number: 12,
    appliesTo: ALL_ACTIVITIES,
    summary:
      "Prévenir les ruptures de parcours et prévenir puis traiter les violences, violences sexistes et sexuelles, le harcèlement et les discriminations pendant la formation.",
    implementationFocus: [
      "mesures d'engagement et de prévention des ruptures",
      "procédure de prévention et de traitement des violences, harcèlements et discriminations",
      "preuves de mise en œuvre et de traitement des situations rencontrées",
    ],
  },
  {
    number: 19,
    appliesTo: ALL_ACTIVITIES,
    summary:
      "Mettre les ressources pédagogiques à disposition, vérifier l'effectivité du suivi des modules à distance et, lorsque le seuil réglementaire sera atteint, désigner un référent pédagogique par formation.",
    implementationFocus: [
      "mise à disposition et appropriation des ressources pédagogiques",
      "preuve d'effectivité du suivi pour les modules réalisés à distance",
      "référent pédagogique par formation lorsque le seuil fixé par arrêté est applicable",
    ],
  },
  {
    number: 27,
    appliesTo: ALL_ACTIVITIES,
    summary:
      "En cas de sous-traitance ou de portage salarial, assurer la conformité au référentiel et sa traçabilité dans les contrats de sous-traitance.",
    implementationFocus: [
      "contrôle de conformité des sous-traitants et intervenants en portage",
      "clauses et preuves de conformité traçables dans les contrats",
      "suivi de la conformité pendant l'exécution de la prestation",
    ],
  },
  {
    number: 32,
    appliesTo: ALL_ACTIVITIES,
    summary:
      "Piloter l'amélioration continue à partir des appréciations et réclamations et ajouter une analyse des risques sur la qualité des formations délivrées.",
    implementationFocus: [
      "analyse des appréciations et réclamations",
      "actions d'amélioration continue documentées",
      "analyse des risques sur la qualité des formations délivrées",
    ],
  },
  {
    number: 33,
    appliesTo: ["apprenticeship"],
    summary:
      "Pour l'apprentissage uniquement, évaluer les contenus et enseignements par les apprenants dans un dispositif distinct de la satisfaction générale, partager les résultats avec les équipes pédagogiques et mesurer l'efficacité des améliorations.",
    implementationFocus: [
      "évaluation des contenus et enseignements distincte de la satisfaction générale",
      "partage des résultats avec les équipes pédagogiques",
      "amélioration continue formalisée et mesure périodique de son efficacité",
    ],
  },
] as const;

export function isQualiopiNovember2026IndicatorApplicable(
  indicatorNumber: QualiopiNovember2026Indicator["number"],
  activity: QualiopiActivity,
) {
  const indicator = QUALIOPI_NOVEMBER_2026_FOCUS.find((item) => item.number === indicatorNumber);
  return Boolean(indicator?.appliesTo.includes(activity));
}
