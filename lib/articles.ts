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
        body: "Reprendre le contrôle ne signifie pas tout porter seul. Cela peut vouloir dire poser une organisation claire, automatiser les tâches répétitives, savoir ce qui manque et garder une vue fiable sur chaque session. L'objectif n'est pas d'ajouter une couche de gestion, mais de rendre le suivi plus léger.",
      },
      {
        title: "Ce que Selen veut changer",
        body: "Selen veut remettre l'administratif à sa juste place : en arrière-plan, structuré, suivi et vérifié. Les documents récurrents, les relances et les preuves peuvent être mieux gérés, pendant que les points sensibles restent sous contrôle humain.",
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
      "Automatiser l'administratif sans perdre le contrôle humain : le pari de Selen",
    excerpt:
      "Automatiser ne veut pas dire tout abandonner à une machine. Chez Selen, l'outil travaille, l'humain sécurise.",
    publishedAt: "2026-06-08",
    coverImage: "/Logo_Selen_Daily.png",
    coverAlt: "Mascotte Selen Daily pour la gestion administrative",
    featured: true,
    readingTime: "5 min",
    introduction:
      "L'automatisation peut faire peur. On imagine vite un outil froid, impersonnel, qui décide à la place des humains. Chez Selen, l'idée est différente : automatiser ce qui est répétitif, mais garder l'humain là où il apporte de la valeur.",
    sections: [
      {
        title: "Automatiser ce qui use inutilement",
        body: "Certaines tâches reviennent sans cesse : générer un document, préparer une relance, classer une preuve, signaler une pièce manquante. Elles demandent de l'attention, mais rarement du jugement profond. Ce sont ces gestes répétitifs que Selen cherche à alléger.",
      },
      {
        title: "Garder l'humain sur les points sensibles",
        body: "Tout ne doit pas être automatisé aveuglément. Les situations atypiques, les risques Qualiopi, les incohérences de dossier ou les choix d'organisation demandent encore un regard humain. L'outil aide à repérer, l'humain décide et sécurise.",
      },
      {
        title: "Un outil pour alerter, pas pour remplacer le jugement",
        body: "Selen n'a pas vocation à prendre la place de celles et ceux qui connaissent leur organisme. Il sert à rendre visibles les oublis, les retards et les pièces fragiles. Une bonne alerte au bon moment vaut souvent mieux qu'un grand tableau que personne n'ouvre.",
      },
      {
        title: "Pourquoi c'est adapté aux petits organismes de formation",
        body: "Les petits OF ont besoin d'outils qui font gagner du temps sans imposer une usine à gaz. L'automatisation doit rester lisible, utile et proportionnée. Elle doit soutenir une structure légère, pas lui demander de fonctionner comme une grande administration.",
      },
      {
        title: "Le bon équilibre : 80 % automatisé, 20 % vérifié",
        body: "L'ambition de Selen est d'automatiser environ 80 % de la gestion administrative courante, tout en gardant une vérification humaine sur les points qui comptent. C'est cet équilibre qui permet de gagner du temps sans perdre la maîtrise.",
      },
    ],
    conclusion:
      "Selen n'a pas vocation à remplacer le formateur ni l'agent administratif. Il sert à rendre leur travail plus fluide, plus fiable et moins envahissant.",
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
