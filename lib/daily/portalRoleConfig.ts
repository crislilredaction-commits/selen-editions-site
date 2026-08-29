export type PortalRole = "learner" | "trainer" | "enterprise";
export type PortalSection = { key: string; title: string; description: string };
const COMMON: PortalSection[] = [
  { key: "session", title: "Ma session", description: "Dates, horaires, modalité, lieu et informations pratiques." },
  { key: "documents", title: "Mes documents", description: "Documents autorisés pour cette session." },
  { key: "feedback", title: "Réclamation / suggestion", description: "Transmettre une difficulté, une réclamation ou une suggestion à Selen." },
];
export const PORTAL_ROLE_CONFIG: Record<PortalRole, { label: string; sections: PortalSection[] }> = {
  learner: { label: "apprenant", sections: [{ key: "registration", title: "Mon dossier", description: "Inscription, positionnement et informations transmises." }, ...COMMON, { key: "evaluation", title: "Mon évaluation", description: "Réaliser l’évaluation finale lorsqu’elle est ouverte." }, { key: "satisfaction", title: "Ma satisfaction", description: "Donner votre avis à la fin de la formation." }] },
  trainer: { label: "formateur", sections: [{ key: "participants", title: "Mes participants", description: "Dossiers, positionnements et besoins d’adaptation utiles à la session." }, { key: "followup", title: "Fiche de suivi", description: "Consigner les incidents, adaptations et suites données pendant la session." }, ...COMMON, { key: "satisfaction", title: "Mon retour formateur", description: "Compléter le questionnaire formateur de fin de session." }] },
  enterprise: { label: "entreprise / donneur d’ordre", sections: [{ key: "participants", title: "Mes participants", description: "Suivre les dossiers des participants rattachés à votre entreprise." }, { key: "agreement", title: "Convention et signatures", description: "Consulter et signer les documents contractuels autorisés." }, ...COMMON, { key: "satisfaction", title: "Satisfaction commanditaire", description: "Répondre au questionnaire de satisfaction à froid." }] },
};
export function normalizePortalRole(role: string): PortalRole | null { if (role === "learner" || role === "apprenant") return "learner"; if (role === "trainer" || role === "formateur") return "trainer"; if (role === "enterprise" || role === "entreprise") return "enterprise"; return null; }
