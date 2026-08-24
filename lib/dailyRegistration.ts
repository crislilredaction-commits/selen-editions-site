export const DAILY_NEED_QUESTIONS = [
  { key: "postal_address", label: "Quelle est votre adresse postale ?" },
  { key: "professional_situation", label: "Quelle est votre situation professionnelle actuelle ?" },
  { key: "highest_diploma", label: "Quel est le plus haut diplôme que vous avez obtenu ?" },
  { key: "current_knowledge_level", label: "Quel est votre niveau de connaissance actuel dans le domaine de la formation ?" },
  { key: "expectations", label: "Qu'attendez-vous de cette formation ?" },
  { key: "expressed_need", label: "Quel besoin souhaitez-vous couvrir avec cette formation ?" },
  { key: "objective", label: "Quel est votre objectif professionnel ou personnel ?" },
  { key: "motivations", label: "Qu'est-ce qui motive votre inscription ?" },
  { key: "constraints", label: "Avez-vous des contraintes à signaler : temps, organisation, matériel, transport, disponibilités..." },
  { key: "availability", label: "Quelles sont vos disponibilités ?" },
  { key: "preferred_modality", label: "Quelle modalité souhaitez-vous : présentiel, distanciel ou mixte ?" },
  { key: "details", label: "Souhaitez-vous ajouter une précision utile ?" },
] as const;

export const DAILY_COMPANY_QUESTIONS = [
  { key: "expressed_need", label: "Quel est le besoin exprimé par l'entreprise ?" },
  { key: "employee_objectives", label: "Quels sont les objectifs attendus pour les salariés ?" },
  { key: "request_context", label: "Quel est le contexte de la demande ?" },
  { key: "constraints", label: "Quelles contraintes organisationnelles devons-nous connaître ?" },
  { key: "preferred_modality", label: "Quelles modalités souhaitez-vous : présentiel, distanciel ou mixte ?" },
  { key: "details", label: "Souhaitez-vous ajouter une précision utile ?" },
  { key: "specific_requests", label: "Avez-vous des demandes ou points d'attention particuliers ?" },
] as const;

export const DAILY_POSITIONING_QUESTIONS = [] as const;

export function detectAdaptationNeeded(answers: Record<string, unknown>) {
  const text = [
    answers.adaptation_details,
    answers.company_adaptation_details,
    answers.constraints,
    answers.specific_requests,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return [
    "handicap",
    "adaptation",
    "aménagement",
    "amenagement",
    "contrainte",
    "accessibilité",
    "accessibilite",
  ].some((word) => text.includes(word));
}

export function buildDailyRegistrationSummary(
  responses: Array<{
    response_type: string | null;
    respondent_first_name?: string | null;
    respondent_last_name?: string | null;
    company_name?: string | null;
    need_answers?: Record<string, unknown> | null;
    positioning_answers?: Record<string, unknown> | null;
    adaptation_needed?: boolean | null;
  }>,
) {
  const collect = (key: string) =>
    responses
      .map((response) => String(response.need_answers?.[key] ?? "").trim())
      .filter(Boolean);
  const collectType = (type: string, key: string) =>
    responses
      .filter((response) => response.response_type === type)
      .map((response) => String(response.need_answers?.[key] ?? "").trim())
      .filter(Boolean);

  return {
    synthese_beneficiaire: {
      adresses_postales: collectType("beneficiary", "postal_address"),
      situations_professionnelles: collectType("beneficiary", "professional_situation"),
      diplomes_plus_eleves: collectType("beneficiary", "highest_diploma"),
      niveaux_connaissance_initiaux: collectType("beneficiary", "current_knowledge_level"),
      attentes: collectType("beneficiary", "expectations"),
      besoin_exprime: collectType("beneficiary", "expressed_need"),
      objectif: collectType("beneficiary", "objective"),
      motivations: collectType("beneficiary", "motivations"),
    },
    synthese_entreprise: {
      besoin_exprime: collectType("company", "expressed_need"),
      objectifs_salaries: collectType("company", "employee_objectives"),
      contexte: collectType("company", "request_context"),
    },
    points_communs: collect("details"),
    attentes: collect("expectations"),
    motivations: collect("motivations"),
    contraintes: collect("constraints"),
    demandes_specifiques: collect("specific_requests"),
    besoins_adaptation: [
      ...collect("adaptation_details"),
      ...collect("company_adaptation_details"),
    ],
    points_formateur: collect("specific_requests"),
    positionnement: responses
      .filter((response) => response.response_type === "beneficiary")
      .map((response) => response.positioning_answers)
      .filter((answers) => answers && Object.keys(answers).length > 0),
    adaptation_needed: responses.some((response) => Boolean(response.adaptation_needed)),
    response_count: responses.length,
    generated_at: new Date().toISOString(),
  };
}
