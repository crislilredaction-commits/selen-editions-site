export type ArticleCategory =
  | "Qualiopi"
  | "Gestion quotidienne"
  | "Vision Selen";

export type ArticleSection = {
  title: string;
  body: string;
};

export type Article = {
  slug: string;
  title: string;
  category: ArticleCategory;
  excerpt: string;
  publishedAt: string;
  updatedAt?: string;
  coverImage?: string;
  coverGif?: string;
  coverAlt: string;
  featured: boolean;
  readingTime: string;
  introduction: string;
  sections: ArticleSection[];
  conclusion: string;
};

// TODO futur : remplacer cette source statique par les articles publiés depuis Selen Studio.
// Selen Studio est dans un dépôt séparé. La vitrine devra seulement lire les articles publiés.
// TODO Selen Studio : prévoir une interface d'administration des articles dans le dépôt Studio.
// Champs à gérer : titre, slug, catégorie, résumé, contenu, GIF/image, statut brouillon/publié,
// date de publication, mise à la une.
export const articles: Article[] = [
  {
    slug: "qualiopi-decret-2026-728-preuves",
    category: "Qualiopi",
    title:
      "Qualiopi change au 1er novembre 2026 : les nouvelles preuves à préparer, sans jargon",
    excerpt:
      "Le décret du 1er août 2026 actualise le Référentiel national qualité. Voici ce qui change vraiment et les preuves concrètes à préparer pour vos prochains audits.",
    publishedAt: "2026-08-14",
    coverImage: "/plum.png",
    coverAlt: "Une plume de rédaction sur fond parchemin",
    featured: true,
    readingTime: "8 min",
    introduction:
      "Le décret n° 2026-728 du 1er août 2026 a été publié au Journal officiel du 4 août. Il actualise le Référentiel national qualité qui sert de base à Qualiopi et entrera en vigueur le 1er novembre 2026. Les sept critères restent en place, mais plusieurs indicateurs deviennent plus précis et un 33e indicateur apparaît pour les CFA. Pas besoin de jeter tout votre système qualité par la fenêtre : l'enjeu est surtout de mieux prouver ce que vous faites réellement. Important : le décret fixe les exigences, mais ne donne pas une liste officielle exhaustive de documents à présenter. Les preuves proposées ci-dessous sont donc des exemples pratiques pour anticiper l'audit, en attendant l'actualisation du guide de lecture Qualiopi.",
    sections: [
      {
        title: "1. Votre communication devra être encore plus vérifiable",
        body: "Les indicateurs 1 et 2 sont renforcés. Les informations diffusées au public doivent être accessibles, détaillées et vérifiables, sans formulation pouvant induire en erreur. Les indicateurs de résultats doivent aussi préciser clairement leur mode de calcul ou s'appuyer sur un dispositif existant. Concrètement, gardez une copie datée de vos pages ou supports de communication, la source des chiffres publiés et un petit tableau expliquant comment sont calculés vos taux de satisfaction, de réussite ou d'insertion. Si vous affichez 96 % de satisfaction, il faut pouvoir expliquer d'où vient ce 96 %, et pas seulement espérer que personne ne pose la question.",
      },
      {
        title: "2. Pour une formation certifiante, il faudra mieux démontrer le lien avec la certification",
        body: "L'indicateur 7 demande désormais au prestataire de vérifier l'adéquation du contenu de la formation avec les exigences de la certification visée et de pouvoir prouver sa capacité à assurer cette certification, y compris lorsqu'il intervient comme organisme habilité. À préparer : le référentiel de la certification applicable, un tableau simple reliant compétences ou blocs aux séquences de formation et aux évaluations, ainsi que les habilitations, conventions ou autres documents établissant votre droit à préparer ou organiser la certification lorsque cela vous concerne. L'indicateur 3 renforce aussi l'information à fournir sur les taux d'obtention, blocs, équivalences, passerelles, suites de parcours et débouchés.",
      },
      {
        title: "3. À distance, mettre un module en ligne ne suffira plus à démontrer son suivi",
        body: "L'indicateur 19 précise que, lorsque des modules sont réalisés à distance, l'organisme doit vérifier l'effectivité de leur suivi par les apprenants. Une simple plateforme avec des ressources disponibles devient donc une preuve assez maigre si rien ne montre ce que l'apprenant a réellement réalisé. Prévoyez des traces de progression, activités ou travaux remis, quiz ou évaluations, échanges pédagogiques, relevés de suivi et interventions du formateur. Le décret prévoit aussi un référent pédagogique par formation au-delà d'un nombre d'intervenants qui sera fixé par arrêté : ce seuil n'est donc pas à inventer soi-même en attendant le texte d'application.",
      },
      {
        title: "4. Violences, harcèlement et discriminations entrent plus clairement dans le contrôle",
        body: "L'indicateur 12 prévoit désormais que l'organisme s'assure de la prévention et du traitement des situations de violence, notamment sexistes et sexuelles, de harcèlement ou de discrimination pendant la formation. Pour être prêt, formalisez au minimum une procédure simple : comment signaler une situation, qui reçoit l'alerte, comment elle est traitée et comment les personnes sont orientées ou protégées. Gardez également la preuve que les bénéficiaires savent comment effectuer un signalement. Les indicateurs 14 et 15 renforcent encore ces obligations pour les CFA et l'information des apprentis, notamment mineurs.",
      },
      {
        title: "5. Sous-traitance et portage salarial : la traçabilité doit apparaître dans les contrats",
        body: "L'indicateur 27 vise désormais explicitement la sous-traitance et le portage salarial. Le prestataire doit s'assurer du respect du référentiel et en assurer la traçabilité dans les contrats de sous-traitance. Concrètement, vos contrats devraient identifier les exigences qualité applicables, et votre dossier devrait permettre de montrer comment vous avez vérifié les compétences et le respect des règles par l'intervenant : CV ou justificatifs de compétences, contrôle des documents utiles, engagements qualité, évaluations ou suivi des interventions selon le contexte. Une clause posée dans un contrat sans aucun suivi derrière risque de raconter une histoire assez courte à l'auditeur.",
      },
      {
        title: "6. L'amélioration continue devra aussi intégrer les risques",
        body: "L'indicateur 32 ajoute explicitement une analyse des risques portant sur la qualité des formations délivrées. Il devient donc pertinent de tenir un registre très simple : risque identifié, cause, niveau de vigilance, action prévue, responsable, échéance et résultat du suivi. Exemples : indisponibilité d'un formateur, plateforme distancielle défaillante, prérequis mal évalués, matériel indispensable indisponible, abandon important ou difficulté récurrente signalée par les apprenants. L'objectif n'est pas de construire une usine ISO miniature, mais de montrer que les problèmes prévisibles sont identifiés avant de devenir de vrais problèmes.",
      },
      {
        title: "7. CFA : un nouvel indicateur 33 consacré à l'évaluation des enseignements",
        body: "Ce point concerne les CFA. Le nouvel indicateur 33 impose un dispositif d'évaluation des contenus et des enseignements par les apprenants, distinct du simple questionnaire général de satisfaction. Les résultats doivent être partagés avec les équipes pédagogiques, conduire à une démarche d'amélioration continue formalisée et son efficacité doit être mesurée périodiquement. Il faudra donc distinguer clairement : « êtes-vous satisfait de la formation ? » et « les contenus, méthodes et enseignements vous ont-ils réellement permis d'apprendre ? ». Les preuves utiles pourront être le questionnaire pédagogique, la synthèse des réponses, le compte rendu de partage avec l'équipe, les décisions prises et une vérification ultérieure de leur efficacité.",
      },
      {
        title: "8. Ce que je conseille de mettre en place avant le 1er novembre",
        body: "Commencez par quatre choses simples : vérifiez toutes les informations publiées sur vos formations et documentez le calcul de vos résultats ; sécurisez la traçabilité du suivi pour les formations à distance ; ajoutez une procédure courte pour les violences, le harcèlement et les discriminations ; créez un petit registre des risques qualité. Si vous sous-traitez, relisez également vos contrats et votre manière de contrôler les intervenants. Pour les formations certifiantes, formalisez le lien entre votre programme et le référentiel de certification. Et si vous êtes CFA, préparez dès maintenant une véritable évaluation pédagogique distincte de la satisfaction générale.",
      },
      {
        title: "Ce qui ne change pas : une preuve doit raconter ce qui s'est réellement passé",
        body: "Le nouveau décret ne transforme pas Qualiopi en concours du plus gros classeur. Une preuve reste utile lorsqu'elle est cohérente avec votre activité, datée, applicable au bon bénéficiaire ou à la bonne formation et réellement utilisée. Un beau modèle vide ne démontre rien. À l'inverse, une trace simple mais fiable d'un positionnement, d'une adaptation, d'un suivi pédagogique ou d'une action d'amélioration peut être très parlante. Le meilleur réflexe reste donc le même : faire, tracer, conserver et pouvoir expliquer.",
      },
    ],
    conclusion:
      "À partir du 1er novembre 2026, Qualiopi demandera un peu moins de déclaratif et davantage de traces vérifiables de la qualité réellement mise en œuvre. Pour les petits organismes déjà sérieux dans leur suivi, il ne s'agit pas de tout reconstruire : il faut surtout rendre plus visibles, plus traçables et plus faciles à retrouver les pratiques qui existent déjà.",
  },
  {
    slug: "quand-administratif-prend-le-dessus",
    category: "Gestion quotidienne",
    title:
      "Quand l'administratif prend le dessus : pourquoi les petits organismes de formation s'épuisent",
    excerpt:
      "Dossiers qui s'empilent, signatures à relancer, preuves à retrouver avant l'audit... L'administratif peut vite voler la vedette à la formation.",
    publishedAt: "2026-06-12",
    coverGif: "/gif-papiers.gif",
    coverAlt: "Des papiers administratifs qui s'accumulent",
    featured: true,
    readingTime: "5 min",
    introduction:
      "Au départ, il y a souvent une envie simple : transmettre un savoir, accompagner des personnes, créer des formations utiles. Puis arrivent les conventions, les émargements, les questionnaires, les relances, les preuves Qualiopi, les tableaux de suivi... et petit à petit, l'administratif prend toute la place.",
    sections: [
      {
        title:
          "Le problème n'est pas la formation, c'est tout ce qui gravite autour",
        body: "La formation reste le cœur du métier. Ce qui épuise, c'est la somme des tâches invisibles qui s'ajoutent autour : vérifier les documents, relancer les signatures, retrouver une preuve, mettre à jour un tableau, répondre à une demande urgente. Chaque action paraît petite, mais l'ensemble finit par grignoter les journées.",
      },
      {
        title: "Les petits OF n'ont pas les moyens des grosses structures",
        body: "Un petit organisme de formation n'a pas toujours un service administratif, un responsable qualité et une personne dédiée au suivi des dossiers. Souvent, la même personne vend, forme, coordonne, facture, classe et prépare les audits. Les outils doivent donc rester simples, utiles et adaptés à cette réalité de terrain.",
      },
      {
        title:
          "La charge mentale administrative finit par peser sur la pédagogie",
        body: "Quand l'administratif occupe trop de place, il suit le formateur jusque dans la salle de formation. On pense à la feuille d'émargement manquante, à la convention non signée, au questionnaire à envoyer. Cette tension abîme la disponibilité, l'énergie et parfois le plaisir de transmettre.",
      },
      {
        title: "Reprendre le contrôle sans tout faire soi-même",
        body: "Reprendre le contrôle ne signifie pas tout porter seul. Cela peut vouloir dire poser une organisation claire, savoir ce qui manque, garder une vue fiable sur chaque session et être accompagné au bon moment. L'objectif n'est pas d'ajouter une couche de gestion, mais de rendre le suivi plus léger.",
      },
      {
        title: "Ce que Selen veut changer",
        body: "Selen veut remettre l'administratif à sa juste place : en arrière-plan, structuré, suivi et rassurant. Les documents récurrents, les relances et les preuves sont mieux organisés, avec un accompagnement humain sur les moments qui comptent.",
      },
    ],
    conclusion:
      "Un formateur passionné devrait pouvoir rester passionnant. L'administratif doit soutenir la formation, pas l'étouffer.",
  },
  {
    slug: "qualiopi-preuves-session-formation",
    category: "Qualiopi",
    title: "Qualiopi : quelles preuves garder pour une session de formation ?",
    excerpt:
      "Avant, pendant et après une session, certaines preuves doivent être conservées pour sécuriser votre organisation et préparer vos audits.",
    publishedAt: "2026-06-10",
    coverImage: "/plum.png",
    coverAlt: "Une plume de rédaction sur fond parchemin",
    featured: true,
    readingTime: "6 min",
    introduction:
      "En audit Qualiopi, il ne suffit pas de dire que les choses ont été faites. Il faut pouvoir les montrer. Pour chaque session de formation, certaines preuves permettent de démontrer que l'organisation est suivie, cohérente et maîtrisée.",
    sections: [
      {
        title: "Avant la session : préparer et informer",
        body: "Avant le démarrage, gardez les éléments qui montrent que l'action a été préparée correctement : programme, convention ou contrat, convocation, informations pratiques, positionnement si nécessaire, besoins ou adaptations identifiées. Ces pièces racontent le cadre posé avant la formation.",
      },
      {
        title: "Pendant la session : tracer la présence et les adaptations",
        body: "Pendant la formation, les feuilles d'émargement, relevés de connexion, traces d'assiduité, ajustements pédagogiques et incidents éventuels permettent de montrer que la session a bien été suivie. Ce sont souvent des preuves simples, mais elles doivent être complètes et rattachées à la bonne action.",
      },
      {
        title: "Après la session : évaluer, améliorer, conserver",
        body: "Après la session, conservez les évaluations, attestations, certificats de réalisation, bilans, retours apprenants et actions d'amélioration. Ces documents montrent que l'organisme ne se contente pas de former : il suit, analyse et fait progresser sa pratique.",
      },
      {
        title: "Le piège : avoir les preuves, mais ne pas les retrouver",
        body: "Beaucoup d'organismes possèdent les bons documents, mais les cherchent au dernier moment dans des mails, dossiers locaux ou anciens exports. En audit, une preuve introuvable produit le même stress qu'une preuve absente. Le classement fait partie de la sécurité.",
      },
      {
        title: "L'intérêt d'un classement par session et par apprenant",
        body: "Un classement clair par session, puis par apprenant lorsque c'est utile, permet de reconstituer rapidement le parcours. On sait ce qui a été envoyé, signé, complété, relancé et archivé. C'est simple, mais très puissant le jour où l'on doit justifier son organisation.",
      },
    ],
    conclusion:
      "Une preuve utile est une preuve claire, datée, rattachée à la bonne session et retrouvable rapidement.",
  },
  {
    slug: "automatiser-administratif-controle-humain",
    category: "Vision Selen",
    title:
      "Alléger l'administratif Qualiopi sans laisser les organismes seuls",
    excerpt:
      "Selen structure le suivi Qualiopi, prépare les éléments utiles et garde un agent dédié au cœur de l'accompagnement.",
    publishedAt: "2026-06-08",
    coverImage: "/Logo_Selen_Daily.png",
    coverAlt: "Mascotte Selen Daily pour la gestion administrative",
    featured: true,
    readingTime: "5 min",
    introduction:
      "La gestion Qualiopi peut vite prendre trop de place dans le quotidien d'un organisme de formation. Chez Selen, l'idée est simple : organiser le suivi, préparer les éléments nécessaires et laisser un agent dédié accompagner le dossier avec attention.",
    sections: [
      {
        title: "Alléger ce qui use inutilement",
        body: "Certaines tâches reviennent sans cesse : préparer un document, relancer une signature, classer une preuve, repérer une pièce manquante. Elles demandent de l'attention et finissent par peser sur les journées. Selen aide à rendre ce suivi plus clair, plus régulier et moins envahissant.",
      },
      {
        title: "Un agent dédié suit le dossier",
        body: "Votre agent Selen veille à ce que les documents soient complets, signés et prêts au bon moment. Il suit les étapes importantes, repère les incohérences et rappelle au client uniquement les actions qui nécessitent réellement son intervention.",
      },
      {
        title: "Des rappels utiles, sans surcharge",
        body: "Selen n'a pas vocation à noyer les organismes sous les notifications. Le suivi sert à rendre visibles les oublis, les retards et les pièces fragiles, puis à rappeler les étapes importantes au bon moment, avec un message clair.",
      },
      {
        title: "Pourquoi c'est adapté aux petits organismes de formation",
        body: "Les petits OF ont besoin d'un accompagnement qui fait gagner du temps sans imposer une usine à gaz. Le suivi doit rester lisible, utile et proportionné. Il doit soutenir une structure légère, pas lui demander de fonctionner comme une grande administration.",
      },
      {
        title: "Un suivi humain et structuré",
        body: "Selen s'occupe de l'administratif Qualiopi pour que le client n'ait pas à tout gérer seul. Les documents sont préparés, suivis et contrôlés avec méthode, pendant que l'organisme intervient seulement lorsque sa validation est réellement nécessaire.",
      },
    ],
    conclusion:
      "Selen n'a pas vocation à remplacer le formateur ni l'agent administratif. Il sert à rendre leur travail plus fluide, plus fiable et moins envahissant, avec un accompagnement humain à chaque étape importante.",
  },
];

export const articleCategories: ArticleCategory[] = [
  "Qualiopi",
  "Gestion quotidienne",
  "Vision Selen",
];

export function getSortedArticles() {
  return [...articles].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function getFeaturedArticles(limit = 3) {
  const sortedArticles = getSortedArticles();
  const featuredArticles = sortedArticles.filter((article) => article.featured);

  return (featuredArticles.length > 0 ? featuredArticles : sortedArticles).slice(
    0,
    limit,
  );
}

export function formatArticleDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

export function getArticleCover(article: Article) {
  return article.coverGif || article.coverImage;
}
