"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import { checkPreauditAccess } from "../../../lib/checkPreauditAccess";
import ClientSupportBar from "@/components/ClientSupportBar";

type Answer = "yes" | "partial" | "no" | "unknown";
type Diagnostic = "a_verifier" | "majeure" | "mineure" | "conforme";

type Question = {
  id: string;
  question_order: number;
  question: string;
  help_text: string | null;
  is_critical: boolean;
  affects_major: boolean;
  affects_minor: boolean;
  display_condition: Record<string, unknown> | null;
};

type SessionInfo = {
  audit_type?: string | null;
  is_new_entrant?: boolean | null;
  applicable_indicators?: number[];
  excluded_indicators?: number[];
  profile_data?: Record<string, unknown>;
};

function computeDiagnostic(
  indicatorNumber: number,
  questions: Question[],
  answers: Record<string, Answer>,
): Diagnostic {
  let hasMajor = false;
  let hasMinor = false;
  let answered = 0;

  questions.forEach((q) => {
    const answer = answers[q.id];

    if (!answer) return;

    answered++;

    if (answer === "no") {
      if (q.affects_major) hasMajor = true;
      else if (q.affects_minor) hasMinor = true;
    }

    if (answer === "partial") {
      if (
        (indicatorNumber === 10 ||
          indicatorNumber === 11 ||
          indicatorNumber === 12 ||
          indicatorNumber === 14 ||
          indicatorNumber === 15 ||
          indicatorNumber === 16 ||
          indicatorNumber === 20 ||
          indicatorNumber === 21 ||
          indicatorNumber === 22 ||
          indicatorNumber === 26 ||
          indicatorNumber === 27 ||
          indicatorNumber === 28 ||
          indicatorNumber === 29 ||
          indicatorNumber === 31 ||
          indicatorNumber === 32) &&
        q.affects_major
      ) {
        hasMajor = true;
      } else {
        hasMinor = true;
      }
    }
  });

  const requiredAnswers = Math.min(5, questions.length);

  if (answered < requiredAnswers) return "a_verifier";
  if (hasMajor) return "majeure";
  if (hasMinor) return "mineure";
  return "conforme";
}

function getIssues(questions: Question[], answers: Record<string, Answer>) {
  const issues: string[] = [];

  questions.forEach((q) => {
    const answer = answers[q.id];

    if (!answer) return;

    if (answer === "no" && q.affects_major) {
      issues.push(`❌ ${q.question}`);
    }

    if (answer === "partial" && q.affects_major) {
      issues.push(`⚠️ ${q.question}`);
    }

    if (answer === "no" && q.affects_minor) {
      issues.push(`⚠️ ${q.question}`);
    }
  });

  return issues;
}

function diagnosticLabel(diagnostic: Diagnostic) {
  if (diagnostic === "majeure") return "⚠️ Non-conformité majeure probable";
  if (diagnostic === "mineure") return "⚠️ Non-conformité mineure probable";
  if (diagnostic === "conforme") return "✅ Conforme";
  return "… En cours d’analyse";
}

function diagnosticText(diagnostic: Diagnostic) {
  if (diagnostic === "majeure") {
    return "Au moins un point critique présente un risque de non-conformité majeure.";
  }

  if (diagnostic === "mineure") {
    return "Certains éléments nécessitent des ajustements pour être pleinement conformes.";
  }

  if (diagnostic === "conforme") {
    return "Votre base semble conforme. Cette auto-évaluation ne garantit pas la conformité sans une vérification humaine par un auditeur, bien entendu :)";
  }

  return "Répondez aux questions pour obtenir un premier diagnostic.";
}

function diagnosticColor(diagnostic: Diagnostic) {
  if (diagnostic === "majeure") return "var(--rust)";
  if (diagnostic === "mineure") return "var(--ocre-gold)";
  if (diagnostic === "conforme") return "#6a8a4a";
  return "var(--ink-faint)";
}

function formatAuditType(value?: string | null) {
  if (value === "initial") return "Initial";
  if (value === "surveillance") return "Surveillance";
  if (value === "renouvellement") return "Renouvellement";
  return "Non renseigné";
}

function getIndicatorInfoBlocks(indicatorNumber: number) {
  const blocks: Record<number, { title: string; text: string }[]> = {
    1: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "Vos informations doivent être accessibles au public avant toute contractualisation, complètes, cohérentes et à jour sur l’ensemble de vos supports.",
      },
      {
        title: "Preuves attendues",
        text: "Site internet, fiche formation, plaquette commerciale, catalogue ou email envoyé avant signature.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur est souvent vérifié en premier. Un site incomplet peut influencer négativement l’ensemble de l’audit.",
      },
    ],
    2: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que des indicateurs de résultats existent, qu’ils sont adaptés à la prestation et qu’ils sont diffusés au public.",
      },
      {
        title: "Preuves attendues",
        text: "Taux de satisfaction, taux de réussite ou d’atteinte des objectifs, taux d’abandon, indicateurs spécifiques selon la prestation.",
      },
      {
        title: "Bon à savoir",
        text: "Un taux seul ne suffit pas toujours : il est préférable d’indiquer aussi le volume concerné et la période de référence.",
      },
    ],
    3: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "Pour les certifications, VAE ou apprentissages, l’auditeur vérifie que les informations obligatoires liées à la certification sont accessibles et actualisées.",
      },
      {
        title: "Preuves attendues",
        text: "Taux d’obtention, taux de présentation, blocs de compétences, passerelles, équivalences, débouchés, taux d’insertion si applicable.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur ne concerne pas les formations non certifiantes classiques.",
      },
    ],
    4: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le besoin du bénéficiaire est analysé avant l’entrée en formation et que cette analyse est tracée.",
      },
      {
        title: "Preuves attendues",
        text: "Dossier d’inscription, fiche de renseignement, questionnaire d’analyse du besoin, validation des prérequis, positionnement amont.",
      },
      {
        title: "Bon à savoir",
        text: "L’analyse du besoin doit servir à adapter la prestation si nécessaire, pas seulement à collecter des informations administratives.",
      },
    ],
    5: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les objectifs sont clairs, opérationnels, adaptés au public et cohérents avec les évaluations.",
      },
      {
        title: "Preuves attendues",
        text: "Programme de formation, objectifs rédigés avec des verbes d’action, évaluations permettant de vérifier l’atteinte des objectifs.",
      },
      {
        title: "Bon à savoir",
        text: "Un bon objectif décrit ce que l’apprenant sera capable de faire, pas seulement ce qu’il va comprendre.",
      },
    ],
    6: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les contenus, modalités et moyens pédagogiques sont cohérents avec les objectifs, le public bénéficiaire et les besoins identifiés.",
      },
      {
        title: "Preuves attendues",
        text: "Programme détaillé, analyse du besoin, positionnement amont, adaptations pédagogiques, supports, modalités de mise en œuvre, politique handicap.",
      },
      {
        title: "Bon à savoir",
        text: "L’adaptation doit être justifiable : elle doit découler de l’analyse du besoin, du public visé, des objectifs et, si besoin, d’une situation de handicap.",
      },
    ],
    7: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les contenus de formation sont en adéquation avec les compétences, blocs et épreuves d’évaluation de la certification visée.",
      },
      {
        title: "Preuves attendues",
        text: "Référentiel RNCP/RS, programme de formation, tableau de correspondance contenus-compétences-évaluations, modalités de certification.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur concerne les formations certifiantes. Le programme doit démontrer clairement le lien avec le référentiel de certification.",
      },
    ],
    8: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie qu’un positionnement ou une évaluation des acquis est réalisé avant l’entrée en formation, et que cette démarche est adaptée au public et aux modalités prévues.",
      },
      {
        title: "Preuves attendues",
        text: "Questionnaire de positionnement, test de connaissances, entretien amont, validation des prérequis, fiche d’analyse du besoin, trace des adaptations décidées.",
      },
      {
        title: "Bon à savoir",
        text: "Le positionnement doit servir concrètement : il permet de vérifier le niveau d’entrée, de valider les prérequis et d’adapter le parcours si nécessaire.",
      },
    ],

    9: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le bénéficiaire reçoit, avant le démarrage, les informations nécessaires au bon déroulement de la prestation.",
      },
      {
        title: "Preuves attendues",
        text: "Convocation, livret d’accueil, email d’information, contrat ou convention, règlement intérieur si applicable, preuve de transmission.",
      },
      {
        title: "Bon à savoir",
        text: "Pour le bilan de compétences, l’information doit aussi couvrir les engagements déontologiques : consentement, confidentialité et respect du bénéficiaire.",
      },
    ],
    10: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que la prestation, l’accompagnement et le suivi sont réellement mis en œuvre et adaptés aux profils des bénéficiaires lorsque le besoin l’exige.",
      },
      {
        title: "Preuves attendues",
        text: "Planning, emploi du temps, feuilles d’émargement, tableau de suivi, livret pédagogique, supports de formation (numériques et/ou papier) traces d’accompagnement, adaptations mises en place, échanges ou comptes rendus.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur vérifie le passage du prévu au réel : ce qui a été identifié en amont doit se retrouver dans la mise en œuvre et le suivi.",
      },
    ],
    11: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que l’atteinte des objectifs est évaluée avec un processus formalisé, réellement mis en œuvre et cohérent avec les objectifs annoncés.",
      },
      {
        title: "Preuves attendues",
        text: "Grilles d’évaluation, résultats, bilans intermédiaires ou finaux, auto-évaluations, comptes rendus, livret de compétences, preuves d’évaluation en entreprise ou certification.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur ne vérifie pas seulement l’existence d’un quiz : il faut pouvoir montrer que chaque objectif est évalué et que le résultat est analysé.",
      },
    ],

    12: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que des mesures existent pour maintenir l’engagement des bénéficiaires et prévenir les abandons ou ruptures de parcours.",
      },
      {
        title: "Preuves attendues",
        text: "Tableau de suivi, relances, comptes rendus d’entretien, preuves de présence ou d’activité, points d’étape, suivi à distance, échanges avec l’entreprise ou le tuteur si applicable.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur concerne les prestations de plus de deux jours. Il faut pouvoir montrer des mesures prévues, mais aussi des traces de leur mise en œuvre.",
      },
    ],

    13: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les apprentissages en centre et en entreprise sont coordonnés, progressifs et anticipés avec l’entreprise et l’apprenant.",
      },
      {
        title: "Preuves attendues",
        text: "Carnet ou livret de liaison, planning d’alternance, progression pédagogique, échanges avec le tuteur ou maître d’apprentissage, comptes rendus de suivi ou visites en entreprise.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur concerne l’alternance. Il faut montrer que l’entreprise n’est pas seulement un lieu d’accueil, mais un lieu d’apprentissage coordonné avec le centre.",
      },
    ],

    14: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le CFA met en œuvre un accompagnement socio-professionnel, éducatif et citoyen des apprentis, au-delà du simple suivi pédagogique.",
      },
      {
        title: "Preuves attendues",
        text: "Livret de suivi de l’apprenti, règlement intérieur, droits et devoirs, actions citoyennes, ateliers CV ou insertion, prévention du harcèlement et des discriminations, feuilles d’émargement ou traces de participation.",
      },
      {
        title: "Bon à savoir",
        text: "Le livret apprenti peut devenir une preuve centrale s’il contient les informations transmises, les actions proposées et les traces de suivi ou de participation.",
      },
    ],

    15: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les apprentis sont informés de leurs droits et devoirs en tant qu’apprentis et salariés, ainsi que des règles de santé et de sécurité applicables.",
      },
      {
        title: "Preuves attendues",
        text: "Livret de suivi de l’apprenti, règlement intérieur, livret d’accueil, support d’information, preuve de remise ou d’émargement, email d’envoi, compte rendu de réunion d’information.",
      },
      {
        title: "Bon à savoir",
        text: "Pour cet indicateur, une information absente, incomplète ou non prouvée entraîne une non-conformité majeure. La preuve de transmission est donc aussi importante que le contenu.",
      },
    ],
    16: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les bénéficiaires sont présentés à la certification dans le respect des exigences formelles de l’autorité certificatrice.",
      },
      {
        title: "Preuves attendues",
        text: "Règlement ou guide du certificateur, checklist d’inscription, dossiers candidats, preuves de transmission, convocations, calendrier de certification, échanges avec l’autorité certificatrice.",
      },
      {
        title: "Bon à savoir",
        text: "Il ne suffit pas de préparer les bénéficiaires : il faut aussi prouver que les conditions administratives et formelles de présentation à la certification sont respectées.",
      },
    ],

    17: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les moyens humains, techniques, matériels et l’environnement sont adaptés aux objectifs, au public et aux modalités de la prestation.",
      },
      {
        title: "Preuves attendues",
        text: "CV ou profils des intervenants, planning d’intervention, inventaire matériel, contrat de location, convention de mise à disposition, registre d’accessibilité, DUERP, captures de plateforme, supports ou photos des équipements.",
      },
      {
        title: "Bon à savoir",
        text: "Il ne faut pas seulement disposer de moyens : il faut montrer qu’ils sont adaptés à la prestation réellement auditée, y compris lorsque les locaux ou équipements sont fournis par un tiers.",
      },
    ],

    18: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les fonctions nécessaires à la prestation sont identifiées et que les intervenants internes ou externes sont mobilisés et coordonnés.",
      },
      {
        title: "Preuves attendues",
        text: "Planning d’intervention, organigramme fonctionnel, fiches de mission, emails de cadrage, comptes rendus, tableau de suivi, échanges avec les intervenants, contrats ou conventions si besoin.",
      },
      {
        title: "Bon à savoir",
        text: "Même un prestataire indépendant peut être concerné : il doit pouvoir expliquer comment il organise les différentes fonctions qu’il assure seul.",
      },
    ],

    19: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que des ressources pédagogiques cohérentes avec les objectifs sont mises à disposition des bénéficiaires et que ceux-ci peuvent se les approprier.",
      },
      {
        title: "Preuves attendues",
        text: "Supports de cours, fiches pratiques, vidéos, ressources documentaires, plateforme, espace partagé, consignes d’accès, tutoriels, preuves de transmission, emails d’envoi, attestations de remise ou captures d’espace en ligne.",
      },
      {
        title: "Bon à savoir",
        text: "Avoir des supports ne suffit pas : il faut pouvoir prouver qu’ils ont bien été remis ou rendus accessibles aux bénéficiaires. Les preuves de remise sont donc indispensables : attestation de remise en main propre, email d’envoi, preuve de transmission via un espace en ligne, capture de dépôt, accusé de réception ou trace équivalente.",
      },
    ],

    20: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le CFA dispose d’un personnel dédié à la mobilité nationale et internationale, d’un référent handicap identifié et d’un conseil de perfectionnement.",
      },
      {
        title: "Preuves attendues",
        text: "Liste des membres du conseil de perfectionnement, dernier compte rendu ou procès-verbal, noms et qualités des personnes dédiées à la mobilité, nom et contact du référent handicap, preuves des actions menées.",
      },
      {
        title: "Bon à savoir",
        text: "Cet indicateur ne se limite pas à nommer des personnes : il faut prouver que les rôles existent, qu’ils sont identifiés et que des actions sont mises en œuvre ou au minimum organisées.",
      },
    ],

    21: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les intervenants disposent de compétences adaptées aux prestations réalisées et que ces compétences sont justifiées par des preuves concrètes.",
      },
      {
        title: "Preuves attendues",
        text: "Diplômes, titres, certifications, attestations de formation, CV à jour, habilitations éventuelles, justificatifs d’expérience, dossier intervenant, preuves de formation continue ou de spécialisation.",
      },
      {
        title: "Bon à savoir",
        text: "Pour cet indicateur, les preuves les plus importantes sont les diplômes, certifications et attestations de formation. Un CV seul peut aider, mais il est préférable de conserver des justificatifs concrets permettant de prouver la compétence professionnelle et pédagogique de chaque intervenant.",
      },
    ],

    22: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que les compétences du personnel, ou du prestataire lui-même lorsqu’il travaille seul, sont entretenues et développées en cohérence avec les prestations délivrées.",
      },
      {
        title: "Preuves attendues",
        text: "Plan de développement des compétences, attestations de formation, certificats, preuves de participation à des webinaires, veille métier, échanges de pratiques, entretiens professionnels, actions de professionnalisation ou justificatifs de formation continue.",
      },
      {
        title: "Bon à savoir",
        text: "Pour les indépendants, certains certificateurs demandent aussi un plan de développement des compétences personnel. Il est donc préférable de formaliser les formations suivies, les actions prévues, la veille réalisée et les compétences à maintenir ou développer.",
      },
    ],

    23: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire réalise une veille légale et réglementaire sur le champ de la formation professionnelle, qu’il en garde une trace et qu’il en exploite les enseignements.",
      },
      {
        title: "Preuves attendues",
        text: "Tableau de veille, sources suivies, newsletters, liens institutionnels, notes d’analyse, exemples de mise à jour de documents ou procédures, preuve de diffusion aux personnes concernées.",
      },
      {
        title: "Bon à savoir",
        text: "La veille doit être vivante : il faut montrer une information repérée, son analyse, la décision prise et, si nécessaire, la mise à jour réalisée. Un simple dossier de liens non exploités risque d’être insuffisant.",
      },
    ],

    24: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire réalise une veille sur les évolutions des compétences, des métiers et des emplois dans ses secteurs d’intervention, puis qu’il exploite les informations utiles.",
      },
      {
        title: "Preuves attendues",
        text: "Tableau de veille, sources métiers, observatoires, OPCO, branches professionnelles, salons, conférences, réseaux professionnels, revues spécialisées, notes d’analyse et exemples d’adaptation des prestations.",
      },
      {
        title: "Bon à savoir",
        text: "La veille métier doit servir à faire évoluer les prestations si nécessaire : contenu, exemples, compétences visées, supports, exercices, cas pratiques ou positionnement. Il faut pouvoir montrer au moins un exemple concret d’information repérée, analysée puis exploitée.",
      },
    ],

    25: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire réalise une veille sur les innovations pédagogiques et technologiques, puis qu’il analyse et exploite les informations utiles pour faire évoluer ses prestations.",
      },
      {
        title: "Preuves attendues",
        text: "Tableau de veille, newsletters, webinaires, salons, conférences, groupes d’échange, tests d’outils, notes d’analyse, captures, exemples d’évolution des supports, modalités ou outils pédagogiques.",
      },
      {
        title: "Bon à savoir",
        text: "Il n’est pas nécessaire d’adopter toutes les innovations repérées. L’important est de montrer que vous les analysez : intérêt, faisabilité, coût, pertinence pour le public, accessibilité, puis décision d’intégration ou non.",
      },
    ],

    26: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire a identifié un réseau handicap mobilisable pour accueillir, accompagner, former ou orienter les publics en situation de handicap.",
      },
      {
        title: "Preuves attendues",
        text: "Politique accessibilité handicap, coordonnées de partenaires handicap, référent handicap identifié, procédure de mobilisation du réseau, traces d’échanges, adaptations mises en place ou orientations proposées.",
      },
      {
        title: "Bon à savoir",
        text: "Il faut pouvoir présenter un réseau concret et mobilisable : Agefiph, Cap emploi, MDPH, FIPHFP, partenaires spécialisés et associations locales si pertinent. Une simple phrase d’intention ne suffit pas.",
      },
    ],
    27: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire maîtrise sa sous-traitance ou le recours au portage salarial et s’assure que les intervenants respectent les exigences Qualiopi applicables.",
      },
      {
        title: "Preuves attendues",
        text: "Contrat ou convention de sous-traitance, charte d’engagement Qualiopi signée, CV, diplômes, attestations, consignes transmises, preuves d’intervention, émargements, évaluations, bilans et contrôles qualité.",
      },
      {
        title: "Bon à savoir",
        text: "Un simple contrat commercial ne suffit pas. Il faut montrer que le sous-traitant connaît les exigences qualité, transmet les preuves nécessaires et accepte que ses interventions soient contrôlées par l’organisme donneur d’ordre.",
      },
    ],

    28: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire mobilise un réseau de partenaires socio-économiques pour co-construire l’ingénierie de formation et favoriser l’accueil en entreprise lorsque la prestation comprend des périodes en situation de travail.",
      },
      {
        title: "Preuves attendues",
        text: "Liste des entreprises partenaires, conventions de partenariat, conventions de formation, contacts du réseau socio-économique, comptes rendus de réunions, comités de pilotage, livret alternance, échanges avec les entreprises ou tuteurs.",
      },
      {
        title: "Bon à savoir",
        text: "Une simple liste de contacts ne suffit pas toujours : il faut montrer que le réseau est réellement mobilisé, avec des échanges, conventions, comptes rendus, retours entreprises ou actions concrètes liées à l’accueil en entreprise.",
      },
    ],

    29: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le CFA développe des actions concrètes favorisant l’insertion professionnelle ou la poursuite d’études des apprentis.",
      },
      {
        title: "Preuves attendues",
        text: "Livret de suivi de l’apprenti, planning d’ateliers, feuilles d’émargement, supports CV ou entretien, informations sur les poursuites d’études, partenariats, enquêtes de sortie ou suivi des suites de parcours.",
      },
      {
        title: "Bon à savoir",
        text: "Il ne suffit pas de dire que les apprentis peuvent poursuivre leurs études ou chercher un emploi : il faut montrer les actions proposées, les preuves de participation ou de transmission, et si possible un suivi des suites de parcours.",
      },
    ],

    30: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire recueille les appréciations des parties prenantes concernées : bénéficiaires, financeurs, équipes pédagogiques et entreprises lorsque cela s’applique.",
      },
      {
        title: "Preuves attendues",
        text: "Questionnaires de satisfaction, évaluations à chaud ou à froid, comptes rendus d’entretien, retours formateurs, retours entreprises, sollicitations financeurs, relances, exports de formulaires ou tableaux de synthèse.",
      },
      {
        title: "Bon à savoir",
        text: "Le recueil doit être organisé, tracé et permettre une expression libre. Il ne suffit pas d’avoir un questionnaire : il faut pouvoir prouver qu’il est envoyé, relancé si besoin, complété ou au moins sollicité auprès des parties prenantes concernées.",
      },
    ],

    31: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire a défini et met en œuvre des modalités de traitement des difficultés, aléas et réclamations exprimés par les parties prenantes.",
      },
      {
        title: "Preuves attendues",
        text: "Procédure de traitement, tableau d’amélioration continue, registre des réclamations, emails, accusés de réception, réponses apportées, actions correctives, preuves de clôture et suivi des aléas.",
      },
      {
        title: "Bon à savoir",
        text: "Pour cet indicateur, il faut prouver le traitement réel : réception, analyse, réponse, action décidée, suivi et clôture. Une réclamation non tracée ou une difficulté traitée oralement sans preuve peut fragiliser l’audit.",
      },
    ],

    32: [
      {
        title: "Ce que l’auditeur vérifie",
        text: "L’auditeur vérifie que le prestataire met en œuvre des mesures d’amélioration à partir de l’analyse des appréciations, difficultés, aléas et réclamations.",
      },
      {
        title: "Preuves attendues",
        text: "Tableau d’amélioration continue, analyse des retours, causes identifiées, plan d’action, mesures mises en œuvre, preuves de réalisation, suivi d’efficacité, documents ou procédures mis à jour.",
      },
      {
        title: "Bon à savoir",
        text: "Le 32 ne valide pas seulement l’existence d’un tableau : il faut montrer le chemin complet entre le retour reçu, l’analyse, l’action décidée, la mise en œuvre réelle et la preuve de suivi. Un questionnaire sans exploitation ne suffit pas.",
      },
    ],
  };

  return (
    blocks[indicatorNumber] ?? [
      {
        title: "Ce que l’auditeur vérifie",
        text: "Les exigences spécifiques de cet indicateur doivent être vérifiées à partir du référentiel Qualiopi.",
      },
      {
        title: "Preuves attendues",
        text: "Les preuves attendues dépendent de l’indicateur et de la catégorie d’action concernée.",
      },
      {
        title: "Bon à savoir",
        text: "Complétez progressivement cette aide au fur et à mesure de la construction des indicateurs.",
      },
    ]
  );
}

export default function IndicateurPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const indicatorNumber = Number(params.number);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [title, setTitle] = useState(`Indicateur ${indicatorNumber}`);
  const [questions, setQuestions] = useState<Question[]>([]); // questions VISIBLES (filtrées)
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        router.push("/client/login");
        return;
      }

      const storedSessionId = localStorage.getItem("preaudit_session_id");

      if (!storedSessionId) {
        router.push("/client/preaudit");
        return;
      }

      const { data: pageRaw, error: sessionError } = await supabase.rpc(
        "get_preaudit_profile_page",
        { p_session_id: storedSessionId },
      );

      if (sessionError || !pageRaw) {
        setError(
          `Session préaudit introuvable. ${sessionError?.message ?? ""}`,
        );
        setLoading(false);
        return;
      }

      const page = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw;
      const sessionRow = page.session;
      const sid = sessionRow?.id;

      if (!sid) {
        setError("Session préaudit introuvable.");
        setLoading(false);
        return;
      }

      const applicableIndicators = sessionRow.applicable_indicators ?? [];
      const excludedIndicators = sessionRow.excluded_indicators ?? [];

      setSessionId(sid);
      setSessionInfo({
        audit_type: sessionRow.audit_type,
        is_new_entrant: sessionRow.is_new_entrant,
        applicable_indicators: applicableIndicators,
        excluded_indicators: excludedIndicators,
        profile_data: sessionRow.profile_data ?? {},
      });

      if (!applicableIndicators.includes(indicatorNumber)) {
        const firstIndicator = applicableIndicators[0] ?? 1;

        setError(
          `L’indicateur ${indicatorNumber} n’est pas applicable à votre profil. Redirection vers le premier indicateur applicable…`,
        );

        setLoading(false);

        setTimeout(() => {
          router.push(`/client/preaudit/${firstIndicator}`);
        }, 900);

        return;
      }

      const { data: indicatorData } = await supabase
        .from("preaudit_indicators")
        .select("title, simplified_title")
        .eq("number", indicatorNumber)
        .single();

      setTitle(
        indicatorData?.simplified_title ||
          indicatorData?.title ||
          `Indicateur ${indicatorNumber}`,
      );

      const { data: questionData, error: questionError } = await supabase
        .from("preaudit_questions")
        .select(
          "id, question_order, question, help_text, is_critical, affects_major, affects_minor, display_condition",
        )
        .eq("indicator_number", indicatorNumber)
        .order("question_order", { ascending: true });

      if (questionError) {
        setError(questionError.message);
        setLoading(false);
        return;
      }

      const allQuestionsData = questionData ?? [];

      const profileData = {
        ...(sessionRow.profile_data ?? {}),
        is_new_entrant: sessionRow.is_new_entrant ?? false,
        audit_type: sessionRow.audit_type ?? null,
      };

      const visibleQuestions = allQuestionsData.filter((q) => {
        const condition = q.display_condition ?? {};

        if (Object.keys(condition).length === 0) return true;

        const key = condition.profile_question_key as string | undefined;
        const operator = condition.operator as string | undefined;
        const value = condition.value;

        if (!key) return true;

        const actual = profileData[key];

        if (operator === "equals") {
          return actual === value;
        }

        if (operator === "contains") {
          return Array.isArray(actual) && actual.includes(value);
        }

        // Condition inconnue → on affiche par défaut (safe fallback)
        return true;
      });

      // BUG CORRIGÉ : on set uniquement les questions VISIBLES (filtrées selon profil)
      setQuestions(visibleQuestions);

      // On charge les réponses pour TOUTES les questions (pas seulement visibles)
      // pour ne pas perdre les réponses aux questions temporairement masquées
      const { data: answerData, error: answerError } = await supabase.rpc(
        "get_preaudit_indicator_answers",
        {
          p_session_id: sid,
          p_indicator_number: indicatorNumber,
        },
      );

      if (answerError) {
        setError(answerError.message);
        setLoading(false);
        return;
      }

      const initialAnswers: Record<string, Answer> = {};
      const initialNotes: Record<string, string> = {};
      const noteKey = `indicator_${indicatorNumber}`;

      (answerData ?? []).forEach(
        (row: { question_id: string; answer: string }) => {
          // On stocke TOUTES les réponses (y compris questions masquées)
          // pour ne pas les perdre si le profil change et les rend visibles à nouveau
          if (["yes", "partial", "no", "unknown"].includes(row.answer)) {
            initialAnswers[row.question_id] = row.answer as Answer;
          }
        },
      );

      // Charger la note depuis la table dédiée (indépendante des questions)
      const { data: noteData } = await supabase.rpc(
        "get_preaudit_indicator_note",
        {
          p_session_id: sid,
          p_indicator_number: indicatorNumber,
        },
      );

      if (noteData) {
        initialNotes[noteKey] = noteData as string;
      }

      setAnswers(initialAnswers);
      setNotes(initialNotes);
      setLoading(false);
    }

    load();
  }, [router, supabase, indicatorNumber]);

  async function saveCurrentNote() {
    if (!sessionId) return;
    const noteValue = notes[indicatorNoteKey];
    if (noteValue === undefined) return;
    // Sauvegarde dans la table dédiée preaudit_indicator_notes
    // Indépendant des questions → robuste aux changements de profil
    await supabase.rpc("save_preaudit_indicator_note", {
      p_session_id: sessionId,
      p_indicator_number: indicatorNumber,
      p_user_notes: noteValue,
    });
  }

  function goToIndicator(targetNumber: number) {
    if (!targetNumber || Number.isNaN(targetNumber)) return;

    // On sauvegarde la note en arrière-plan, sans bloquer la navigation.
    void saveCurrentNote();

    router.push(`/client/preaudit/${targetNumber}`);
  }

  async function saveAnswer(questionId: string, answer: Answer) {
    if (!sessionId) return;

    setAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));

    const { error: saveError } = await supabase.rpc(
      "save_preaudit_indicator_answer",
      {
        p_session_id: sessionId,
        p_question_id: questionId,
        p_answer: answer,
        p_answer_details: null,
        p_evidence_notes: null,
        p_user_notes: null,
      },
    );
    // Ne pas appeler router.refresh() ici : cela détruit l'état local (answers, notes)
    // La mise à jour est déjà faite optimistiquement via setAnswers ci-dessus.

    if (saveError) {
      setError(saveError.message);
    }
  }

  // questions = visibles uniquement → diagnostic et issues corrects selon le profil actuel
  const diagnostic = computeDiagnostic(indicatorNumber, questions, answers);
  const issues = getIssues(questions, answers);

  // Progression : ne compter que les questions visibles répondues
  const visibleQuestionIds = new Set(questions.map((q) => q.id));
  const answeredCount = Object.keys(answers).filter((id) =>
    visibleQuestionIds.has(id),
  ).length;
  const totalQuestions = questions.length;
  const progress =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const profileData = sessionInfo?.profile_data ?? {};
  const documents = getIndicatorDocuments(
    indicatorNumber,
    questions,
    answers,
    profileData,
  );

  const categories = Array.isArray(profileData.action_categories)
    ? profileData.action_categories.join(", ")
    : "Non renseigné";

  const indicatorNoteKey = `indicator_${indicatorNumber}`;

  const applicableIndicators = sessionInfo?.applicable_indicators ?? [];
  const currentIndicatorIndex = applicableIndicators.indexOf(indicatorNumber);

  const previousIndicatorNumber =
    currentIndicatorIndex > 0
      ? applicableIndicators[currentIndicatorIndex - 1]
      : null;

  const nextIndicatorNumber =
    currentIndicatorIndex >= 0 &&
    currentIndicatorIndex < applicableIndicators.length - 1
      ? applicableIndicators[currentIndicatorIndex + 1]
      : null;

  if (loading) {
    return (
      <main
        className="gazette-paper"
        style={{ minHeight: "100vh", padding: "3rem" }}
      >
        Chargement de l’indicateur…
      </main>
    );
  }

  function getIndicatorDocuments(
    indicatorNumber: number,
    questions: Question[],
    answers: Record<string, Answer>,
    profileData: Record<string, unknown>,
  ) {
    let hasAccessibilityIssue = false;
    let hasGeneralIssue = false;

    questions.forEach((q) => {
      const answer = answers[q.id];

      if (!answer || answer === "yes") return;

      if (indicatorNumber === 1 && q.question_order === 13) {
        hasAccessibilityIssue = true;
      } else {
        hasGeneralIssue = true;
      }
    });

    const docs: { name: string; url: string }[] = [];

    const baseUrl =
      "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-1/";

    const categories = Array.isArray(profileData.action_categories)
      ? profileData.action_categories.map((item) =>
          String(item).trim().toUpperCase(),
        )
      : [];

    const hasAF =
      categories.includes("AF") ||
      categories.includes("ACTION DE FORMATION") ||
      categories.includes("ACTIONS DE FORMATION") ||
      categories.includes("FORMATION") ||
      categories.includes("ACTION_FORMATION") ||
      categories.includes("ACTIONS_FORMATION");

    const hasBilan =
      categories.includes("BDC") ||
      categories.includes("BC") ||
      categories.includes("BILAN") ||
      categories.includes("BILAN DE COMPÉTENCES") ||
      categories.includes("BILAN DE COMPETENCES");

    const hasVAE =
      categories.includes("VAE") ||
      categories.includes("VALIDATION DES ACQUIS") ||
      categories.includes("VALIDATION DES ACQUIS DE L’EXPÉRIENCE") ||
      categories.includes("VALIDATION DES ACQUIS DE L'EXPÉRIENCE");
    const isCertifying = profileData.certification_training === "yes";
    const isApprenticeship = profileData.alternance_training === "yes";

    // Seulement indicateur 1
    if (indicatorNumber === 1 && hasAccessibilityIssue) {
      docs.push({
        name: "Politique accessibilité handicap",
        url: baseUrl + "politique-accessibilite-handicap.docx",
      });
    }

    // Indicateur 1 et 2 : documents d’information
    if (
      (indicatorNumber === 1 ||
        indicatorNumber === 2 ||
        indicatorNumber === 5) &&
      hasGeneralIssue
    ) {
      if (hasAF) {
        docs.push({
          name: "Informations précontractuelles – Action de formation",
          url: baseUrl + "info-af.docx",
        });
      }

      if ((hasAF && isCertifying) || isApprenticeship) {
        docs.push({
          name: "Informations précontractuelles – Formation certifiante / apprentissage",
          url: baseUrl + "info-afc.docx",
        });
      }

      if (hasBilan) {
        docs.push({
          name: "Informations précontractuelles – Bilan de compétences",
          url: baseUrl + "info-bilan.docx",
        });
      }

      if (hasVAE) {
        docs.push({
          name: "Informations précontractuelles – VAE",
          url: baseUrl + "info-vae.docx",
        });
      }
    }
    if (indicatorNumber === 3 && hasGeneralIssue) {
      if ((hasAF && isCertifying) || isApprenticeship) {
        docs.push({
          name: "Informations précontractuelles – Formation certifiante / apprentissage",
          url: baseUrl + "info-afc.docx",
        });
      }

      if (hasVAE) {
        docs.push({
          name: "Informations précontractuelles – VAE",
          url: baseUrl + "info-vae.docx",
        });
      }
    }
    if (indicatorNumber === 4 && hasGeneralIssue) {
      docs.push({
        name: "Dossier d’inscription et analyse du besoin",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-4/dossier-inscription-analyse-besoin.docx",
      });
    }

    if (indicatorNumber === 5 && hasGeneralIssue && hasVAE) {
      docs.push({
        name: "Contrat d’accompagnement VAE",
        url: baseUrl + "contrat-accompagnement-vae.docx",
      });
    }

    if (indicatorNumber === 6 && hasGeneralIssue) {
      docs.push({
        name: "Tableau de suivi bénéficiaire et adaptations",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-10/tableau-suivi-beneficiaire-adaptations.docx",
      });

      docs.push({
        name: "Dossier d’inscription et analyse du besoin",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-4/dossier-inscription-analyse-besoin.docx",
      });

      const hasHandicapIssue = questions.some((q) => {
        const answer = answers[q.id];
        return q.question_order === 6 && answer && answer !== "yes";
      });

      if (hasHandicapIssue) {
        docs.push({
          name: "Politique accessibilité handicap",
          url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-1/politique-accessibilite-handicap.docx",
        });
      }
    }

    if (indicatorNumber === 7 && hasGeneralIssue) {
      if ((hasAF && isCertifying) || isApprenticeship) {
        docs.push({
          name: "Tableau croisé contenu / référentiel de certification",
          url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-7/tableau-croise-contenu-referentiel-certification.docx",
        });
      }
    }
    if (indicatorNumber === 8 && hasGeneralIssue) {
      docs.push({
        name: "Dossier d’inscription et analyse du besoin",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-4/dossier-inscription-analyse-besoin.docx",
      });

      docs.push({
        name: "Tableau de suivi bénéficiaire et adaptations",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-10/tableau-suivi-beneficiaire-adaptations.docx",
      });
    }
    if (indicatorNumber === 9 && hasGeneralIssue) {
      docs.push({
        name: "Modèle de convocation",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-9/modele-convocation.docx",
      });

      docs.push({
        name: "Livret d’accueil",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-9/livret-accueil.docx",
      });

      if (hasBilan) {
        docs.push({
          name: "Contrat de bilan de compétences",
          url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-9/contrat-bilan-competences.docx",
        });
      }
    }

    if (indicatorNumber === 10 && hasGeneralIssue) {
      docs.push({
        name: "Feuille d’émargement",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-10/feuille-emargement.docx",
      });

      docs.push({
        name: "Tableau de suivi bénéficiaire et adaptations",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-10/tableau-suivi-beneficiaire-adaptations.docx",
      });

      docs.push({
        name: "Planning prévisionnel de parcours",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-10/planning-previsionnel-parcours.docx",
      });
    }
    if (indicatorNumber === 11 && hasGeneralIssue) {
      docs.push({
        name: "Tableau de suivi bénéficiaire et adaptations",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-10/tableau-suivi-beneficiaire-adaptations.docx",
      });
    }

    if (indicatorNumber === 12 && hasGeneralIssue) {
      docs.push({
        name: "Tableau de suivi bénéficiaire et adaptations",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-10/tableau-suivi-beneficiaire-adaptations.docx",
      });

      docs.push({
        name: "Feuille d’émargement",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-10/feuille-emargement.docx",
      });

      docs.push({
        name: "Planning prévisionnel de parcours",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-10/planning-previsionnel-parcours.docx",
      });

      docs.push({
        name: "Procédure de prévention et de gestion des absences et abandons",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-12/procedure-prevention-gestion-absences-abandons.docx",
      });
    }

    if (indicatorNumber === 13 && hasGeneralIssue) {
      docs.push({
        name: "Livret de suivi de l’apprenti",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-13/livret-suivi-apprenti.docx",
      });

      docs.push({
        name: "Planning prévisionnel de parcours",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-10/planning-previsionnel-parcours.docx",
      });

      docs.push({
        name: "Tableau de suivi bénéficiaire et adaptations",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-10/tableau-suivi-beneficiaire-adaptations.docx",
      });
    }

    if (indicatorNumber === 14 && hasGeneralIssue) {
      docs.push({
        name: "Livret de suivi de l’apprenti",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-13/livret-suivi-apprenti.docx",
      });

      docs.push({
        name: "Feuille d’émargement",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-10/feuille-emargement.docx",
      });

      docs.push({
        name: "Planning prévisionnel de parcours",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-10/planning-previsionnel-parcours.docx",
      });
    }

    if (indicatorNumber === 15 && hasGeneralIssue) {
      docs.push({
        name: "Livret de suivi de l’apprenti",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-13/livret-suivi-apprenti.docx",
      });

      docs.push({
        name: "Feuille d’émargement",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-10/feuille-emargement.docx",
      });
    }

    if (indicatorNumber === 16 && hasGeneralIssue) {
      docs.push({
        name: "Procédure de présentation des bénéficiaires à la certification",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-16/procedure-presentation-certification.docx",
      });

      docs.push({
        name: "Tableau croisé contenu / référentiel de certification",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-7/tableau-croise-contenu-referentiel-certification.docx",
      });
    }

    if (indicatorNumber === 18 && hasGeneralIssue) {
      docs.push({
        name: "Organigramme fonctionnel",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-18/organigramme-fonctionnel.docx",
      });

      docs.push({
        name: "Fiche de fonction — Formateur",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-18/fiche-fonction-formateur.docx",
      });

      docs.push({
        name: "Fiche de fonction — Responsable qualité",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-18/fiche-fonction-responsable-qualite.docx",
      });

      docs.push({
        name: "Fiche de fonction — Responsable administratif",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-18/fiche-fonction-responsable-administratif.docx",
      });

      docs.push({
        name: "Fiche de fonction — Référent handicap",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-18/fiche-fonction-referent-handicap.docx",
      });
    }

    if (indicatorNumber === 20 && hasGeneralIssue) {
      docs.push({
        name: "Fiche de fonction — Référent handicap",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-18/fiche-fonction-referent-handicap.docx",
      });

      docs.push({
        name: "Fiche de fonction — Référent mobilité nationale et internationale",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-20/fiche-fonction-referent-mobilite.docx",
      });

      docs.push({
        name: "Liste des membres du conseil de perfectionnement",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-20/liste-membres-conseil-perfectionnement.docx",
      });
    }

    if (indicatorNumber === 22 && hasGeneralIssue) {
      docs.push({
        name: "Plan de développement des compétences",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-22/plan-developpement-competences.docx",
      });
    }

    if (indicatorNumber === 23 && hasGeneralIssue) {
      docs.push({
        name: "Tableau de suivi des veilles",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-23/tableau-suivi-veilles.docx",
      });
    }

    if (indicatorNumber === 24 && hasGeneralIssue) {
      docs.push({
        name: "Tableau de suivi des veilles",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-23/tableau-suivi-veilles.docx",
      });
    }

    if (indicatorNumber === 25 && hasGeneralIssue) {
      docs.push({
        name: "Tableau de suivi des veilles",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-23/tableau-suivi-veilles.docx",
      });
    }

    if (indicatorNumber === 26 && hasGeneralIssue) {
      docs.push({
        name: "Politique accessibilité handicap",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-1/politique-accessibilite-handicap.docx",
      });
    }

    if (indicatorNumber === 27 && hasGeneralIssue) {
      docs.push({
        name: "Contrat de sous-traitance avec charte d’engagement Qualiopi",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-27/contrat-sous-traitance-charte-qualiopi.docx",
      });
    }

    if (indicatorNumber === 28 && hasGeneralIssue) {
      docs.push({
        name: "Tableau de suivi des partenaires socio-économiques",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-28/tableau-partenaires-socio-economiques.docx",
      });

      docs.push({
        name: "Livret de suivi de l’apprenti",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-13/livret-suivi-apprenti.docx",
      });
    }

    if (indicatorNumber === 29 && hasGeneralIssue) {
      docs.push({
        name: "Livret de suivi de l’apprenti",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-13/livret-suivi-apprenti.docx",
      });

      docs.push({
        name: "Tableau de suivi des partenaires socio-économiques",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-28/tableau-partenaires-socio-economiques.docx",
      });
    }

    if (indicatorNumber === 30 && hasGeneralIssue) {
      docs.push({
        name: "Questionnaire de satisfaction à chaud — Apprenant",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-30/questionnaire-satisfaction-chaud-apprenant.docx",
      });

      docs.push({
        name: "Questionnaire de satisfaction à froid — Commanditaire / Entreprise",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-30/questionnaire-satisfaction-froid-commanditaire-entreprise.docx",
      });

      docs.push({
        name: "Questionnaire de satisfaction — Équipe pédagogique",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-30/questionnaire-satisfaction-equipe-pedagogique.docx",
      });

      docs.push({
        name: "Procédure de recueil de la satisfaction et des relances",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-30/procedure-recueil-satisfaction-relances.docx",
      });

      docs.push({
        name: "Tableau d’amélioration continue",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-30/tableau-amelioration-continue.docx",
      });
    }

    if (indicatorNumber === 31 && hasGeneralIssue) {
      docs.push({
        name: "Procédure de recueil de la satisfaction et des relances",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-30/procedure-recueil-satisfaction-relances.docx",
      });

      docs.push({
        name: "Tableau d’amélioration continue",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-30/tableau-amelioration-continue.docx",
      });
    }

    if (indicatorNumber === 32 && hasGeneralIssue) {
      docs.push({
        name: "Tableau d’amélioration continue",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-30/tableau-amelioration-continue.docx",
      });

      docs.push({
        name: "Procédure de recueil de la satisfaction et des relances",
        url: "https://pjbilmywwkpghhayftph.supabase.co/storage/v1/object/public/selen-documents/preaudit/indicateur-30/procedure-recueil-satisfaction-relances.docx",
      });
    }

    return docs;
  }

  return (
    <main
      className="gazette-paper"
      style={{ minHeight: "100vh", padding: "2rem" }}
    >
      <ClientSupportBar context="l’auto-audit Qualiopi" />
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header
          className="gazette-cta"
          style={{ padding: "2rem", marginBottom: "1.5rem" }}
        >
          <div style={{ position: "relative", zIndex: 1 }}>
            <p className="gazette-label">Préaudit Qualiopi</p>
            <h1
              className="gazette-hero-title"
              style={{ color: "var(--parchment)" }}
            >
              {title}
            </h1>
            <p style={{ color: "var(--sepia-mid)" }}>
              Indicateur {indicatorNumber} · {answeredCount}/{totalQuestions}{" "}
              réponses · {progress} %
            </p>
          </div>
        </header>

        {error && (
          <div
            style={{
              border: "1px solid var(--rust)",
              borderLeft: "4px solid var(--rust)",
              background: "rgba(138,75,36,0.06)",
              padding: "1rem",
              marginBottom: "1rem",
              color: "var(--rust)",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 340px",
            gap: "1.25rem",
            alignItems: "start",
          }}
        >
          <section>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.75rem",
                marginBottom: "1.5rem",
              }}
            >
              {getIndicatorInfoBlocks(indicatorNumber).map((block) => (
                <div
                  key={block.title}
                  style={{
                    background: "var(--paper)",
                    border: "1px solid var(--sepia-mid)",
                    position: "relative",
                    padding: "1rem 1rem 1rem 1.25rem",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: "4px",
                      background:
                        "linear-gradient(to bottom, var(--ocre-dark), var(--ocre-gold))",
                    }}
                  />

                  <p
                    style={{
                      fontFamily: "var(--font-cinzel)",
                      fontSize: "0.58rem",
                      letterSpacing: "0.22em",
                      textTransform: "uppercase",
                      color: "var(--ocre-dark)",
                      marginBottom: "0.4rem",
                    }}
                  >
                    {block.title}
                  </p>

                  <p
                    style={{
                      fontSize: "0.88rem",
                      color: "var(--ink-soft)",
                      lineHeight: 1.55,
                    }}
                  >
                    {block.text}
                  </p>
                </div>
              ))}
            </div>

            <div
              style={{
                background:
                  "linear-gradient(to right, rgba(178,138,98,0.07), rgba(178,138,98,0.02))",
                border: "1px solid var(--ocre)",
                borderLeft: "4px solid var(--ocre-dark)",
                padding: "1rem 1.25rem",
                marginBottom: "1.5rem",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-cinzel)",
                  fontSize: "0.58rem",
                  letterSpacing: "0.25em",
                  textTransform: "uppercase",
                  color: "var(--ocre-dark)",
                  marginBottom: "0.6rem",
                }}
              >
                ✦ Simulation — Question d’auditeur
              </p>

              <p
                style={{
                  fontStyle: "italic",
                  fontSize: "0.92rem",
                  color: "var(--ink-soft)",
                  lineHeight: 1.65,
                  paddingLeft: "0.5rem",
                }}
              >
                “Pouvez-vous me montrer où vos informations sont accessibles
                avant toute signature ?”
              </p>
            </div>

            {questions.length === 0 ? (
              <div
                style={{
                  padding: "2rem",
                  border: "1px dashed var(--sepia-mid)",
                  background: "var(--paper)",
                }}
              >
                Aucune question chargée.
              </div>
            ) : (
              <section style={{ display: "grid", gap: "1rem" }}>
                {questions.map((q, index) => (
                  <article
                    key={q.id}
                    style={{
                      background: "var(--paper)",
                      border: "1px solid var(--sepia-mid)",
                      padding: "1rem",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: "var(--font-cinzel, serif)",
                        fontSize: "0.65rem",
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "var(--ocre-dark)",
                      }}
                    >
                      Question {index + 1}
                    </p>

                    <h2
                      style={{
                        fontSize: "1rem",
                        color: "var(--ink)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {q.question}
                    </h2>

                    {q.help_text && (
                      <p
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--ink-faint)",
                          fontStyle: "italic",
                          marginBottom: "0.75rem",
                        }}
                      >
                        {q.help_text}
                      </p>
                    )}

                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {[
                        ["yes", "Oui"],
                        ["partial", "Partiellement"],
                        ["no", "Non"],
                        ["unknown", "Je ne sais pas"],
                      ].map(([value, label]) => {
                        const selected = answers[q.id] === value;

                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => saveAnswer(q.id, value as Answer)}
                            style={{
                              padding: "0.45rem 0.85rem",
                              border: "1px solid var(--sepia-mid)",
                              background: selected
                                ? "var(--ocre-gold)"
                                : "transparent",
                              color: selected ? "#1a1410" : "var(--ink-soft)",
                              cursor: "pointer",
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </section>
            )}
          </section>

          <aside
            style={{
              position: "sticky",
              top: "1.5rem",
              display: "grid",
              gap: "0.9rem",
            }}
          >
            <div
              style={{
                border: "1px solid var(--sepia-mid)",
                borderLeft: `4px solid ${diagnosticColor(diagnostic)}`,
                background:
                  diagnostic === "majeure"
                    ? "rgba(138,75,36,0.07)"
                    : diagnostic === "mineure"
                      ? "rgba(201,160,85,0.07)"
                      : diagnostic === "conforme"
                        ? "rgba(80,120,60,0.07)"
                        : "rgba(90,64,49,0.05)",
                padding: "1rem",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-cinzel)",
                  fontSize: "0.62rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--ocre-dark)",
                  marginBottom: "0.5rem",
                }}
              >
                ✦ Diagnostic
              </p>

              <p
                style={{
                  fontWeight: 700,
                  color: diagnosticColor(diagnostic),
                  marginBottom: "0.35rem",
                }}
              >
                {diagnosticLabel(diagnostic)}
              </p>

              <p
                style={{
                  fontSize: "0.92rem",
                  color: "var(--ink-faint)",
                  lineHeight: 1.5,
                }}
              >
                {diagnosticText(diagnostic)}
              </p>
            </div>

            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                padding: "1rem",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-cinzel)",
                  fontSize: "0.62rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--ocre-dark)",
                  marginBottom: "0.6rem",
                }}
              >
                Points à corriger
              </p>

              {issues.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gap: "0.4rem",
                    fontSize: "0.9rem",
                    color: "var(--ink-soft)",
                  }}
                >
                  {issues.slice(0, 5).map((issue, index) => (
                    <div
                      key={index}
                      style={{
                        borderLeft: "2px solid var(--ocre-gold)",
                        paddingLeft: "0.5rem",
                        lineHeight: 1.4,
                      }}
                    >
                      {issue}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--ink-faint)", fontSize: "0.92rem" }}>
                  Aucun point bloquant détecté pour l’instant.
                </p>
              )}
            </div>
            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                padding: "1rem",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-cinzel)",
                  fontSize: "0.62rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--ocre-dark)",
                  marginBottom: "0.6rem",
                }}
              >
                Documents à télécharger
              </p>

              {documents.length > 0 ? (
                <div style={{ display: "grid", gap: "0.45rem" }}>
                  {documents.map((doc, index) => (
                    <a
                      key={index}
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "block",
                        fontSize: "0.92rem",
                        color: "var(--ink-soft)",
                        borderLeft: "2px solid var(--ocre-gold)",
                        paddingLeft: "0.5rem",
                        textDecoration: "none",
                        lineHeight: 1.4,
                      }}
                    >
                      📥 {doc.name}
                    </a>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--ink-faint)", fontSize: "0.92rem" }}>
                  Aucun document à télécharger pour l’instant.
                </p>
              )}
            </div>

            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                padding: "1rem",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-cinzel)",
                  fontSize: "0.62rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--ocre-dark)",
                  marginBottom: "0.6rem",
                }}
              >
                Notes indicateur
              </p>

              <textarea
                placeholder="Inscrivez ici où retrouver vos preuves lors de l'audit Ex : lien page site, doc interne, point à vérifier, idée d'amélioration..."
                value={notes[indicatorNoteKey] || ""}
                onChange={(e) => {
                  const value = e.target.value;

                  setNotes((prev) => ({
                    ...prev,
                    [indicatorNoteKey]: value,
                  }));
                }}
                onBlur={() => {
                  // Sauvegarde directe dans la table dédiée des notes
                  saveCurrentNote();
                }}
                style={{
                  width: "100%",
                  minHeight: "120px",
                  padding: "0.6rem",
                  border: "1px solid var(--sepia-mid)",
                  background: "rgba(255,255,255,0.6)",
                  fontSize: "0.9rem",
                  color: "var(--ink-soft)",
                  resize: "vertical",
                }}
              />
            </div>

            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--sepia-mid)",
                padding: "1rem",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-cinzel)",
                  fontSize: "0.62rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--ocre-dark)",
                  marginBottom: "0.6rem",
                }}
              >
                Profil d’audit
              </p>

              <p style={{ fontSize: "0.92rem", color: "var(--ink-soft)" }}>
                Type : {formatAuditType(sessionInfo?.audit_type)}
              </p>
              <p style={{ fontSize: "0.92rem", color: "var(--ink-soft)" }}>
                Nouvel entrant : {sessionInfo?.is_new_entrant ? "Oui" : "Non"}
              </p>
              <p style={{ fontSize: "0.92rem", color: "var(--ink-soft)" }}>
                Catégories : {categories}
              </p>
              <p style={{ fontSize: "0.92rem", color: "var(--ink-soft)" }}>
                Indicateurs applicables :{" "}
                {sessionInfo?.applicable_indicators?.length ?? 0}
              </p>
              <p style={{ fontSize: "0.92rem", color: "var(--ink-soft)" }}>
                Indicateurs exclus :{" "}
                {sessionInfo?.excluded_indicators?.length
                  ? sessionInfo.excluded_indicators.join(", ")
                  : "Aucun"}
              </p>
              <div style={{ marginTop: "0.8rem" }}>
                <p
                  style={{
                    fontFamily: "var(--font-cinzel)",
                    fontSize: "0.55rem",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: "var(--ocre-dark)",
                    marginBottom: "0.4rem",
                  }}
                >
                  Aller à un indicateur
                </p>

                <select
                  value={String(indicatorNumber)}
                  onChange={(e) => goToIndicator(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "0.45rem",
                    border: "1px solid var(--sepia-mid)",
                    background: "var(--paper)",
                    color: "var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  {(sessionInfo?.applicable_indicators ?? []).map((num) => (
                    <option key={num} value={String(num)}>
                      Indicateur {num}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={async () => {
                  await saveCurrentNote();
                  router.push("/client/preaudit");
                }}
                className="btn-ink"
              >
                <span>Modifier mon profil</span>
              </button>

              {previousIndicatorNumber !== null && (
                <button
                  type="button"
                  onClick={() => goToIndicator(previousIndicatorNumber)}
                  className="btn-ink"
                >
                  <span>← Indicateur {previousIndicatorNumber}</span>
                </button>
              )}

              {nextIndicatorNumber !== null ? (
                <button
                  type="button"
                  onClick={() => goToIndicator(nextIndicatorNumber)}
                  className="btn-ink"
                >
                  <span>Indicateur {nextIndicatorNumber} →</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    await saveCurrentNote();
                    router.push("/client/preaudit/final");
                  }}
                  className="btn-ink"
                >
                  <span>Voir mon bilan final →</span>
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
