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
