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
    "slug": "animation-formation-faire-participer-apprenants",
    "title": "Le conseil des fantômes : quand vos apprenants disparaissent en pleine formation 🎃",
    "category": "Gestion quotidienne",
    "excerpt": "Apprenants silencieux, bavards ou sceptiques ? Six antidotes pratiques pour faire participer vos groupes sans transformer la formation en séance de torture collective.",
    "publishedAt": "2026-10-30",
    "coverImage": "/plum.png",
    "coverAlt": "Plume de la Gazette Selen sur fond parchemin",
    "featured": true,
    "readingTime": "8 min",
    "introduction": "Vendredi 30 octobre, 9 h 03. Mathilde anime une formation sur la communication professionnelle. Huit adultes sont installés devant elle, huit personnes parfaitement capables de communiquer. En théorie. « Qui peut me donner un exemple de difficulté de communication au travail ? » Silence. Un participant contemple son stylo, un autre le plafond et une mouche hésite à intervenir. Mathilde finit par donner elle-même un exemple. Elle n'anime plus une formation, elle anime une réunion de fantômes. Puisque Halloween approche, voici six apparitions et les techniques pour y survivre.",
    "sections": [
      {
        "title": "👻 Apparition n° 1 : le silence qui fait paniquer le formateur",
        "body": "« Qu'en pensez-vous ? » : la question qui transforme instantanément une salle en bibliothèque. Un participant peut réfléchir, craindre de se tromper ou ne pas comprendre une question trop vaste. Le réflexe de parler immédiatement à sa place peut étouffer sa réflexion. L'antidote Selen : proposez une question précise, par exemple « Notez une situation dans laquelle une consigne professionnelle a été mal comprise ». Laissez une minute de réflexion personnelle, puis proposez une discussion en binôme avant de demander à quelques volontaires de partager un exemple. Le silence n'est pas forcément un échec pédagogique. Parfois, trente secondes d'attente valent mieux qu'un discours supplémentaire de cinq minutes."
      },
      {
        "title": "🧛 Apparition n° 2 : le vampire du temps de parole",
        "body": "Un participant raconte une anecdote. Puis une deuxième. Puis une troisième, impliquant une photocopieuse et un déjeuner d'équipe en 2019. Dix minutes plus tard, il parle toujours. Le but n'est pas de l'humilier, mais de rendre la parole aux autres. Essayez : « Ton exemple illustre bien la difficulté. Je vais m'arrêter sur ce point pour entendre d'autres expériences, puis nous reviendrons à la solution. » Vous pouvez fixer une minute par personne pour un premier tour ou demander à chacun de préparer une réponse écrite avant le débat. Un groupe n'est pas un concours de monologues, même si certains concurrents affichent une préparation redoutable."
      },
      {
        "title": "🧟 Apparition n° 3 : « Je sais déjà tout ça »",
        "body": "« Cela fait vingt ans que je travaille dans ce domaine », annonce un participant, bras croisés. Il a peut-être beaucoup d'expérience, ne voit pas l'utilité de la séquence ou a été inscrit sans être consulté. Au lieu de le contredire, demandez : « Même avec vingt ans de pratique, quelle situation reste difficile à gérer ? » Puis proposez un cas complexe pour mobiliser son expertise et permettre au groupe d'explorer plusieurs approches. Vous pouvez alors vérifier la compétence visée. Attention toutefois : avoir de l'expérience ne fait pas de lui votre coformateur bénévole."
      },
      {
        "title": "🐺 Apparition n° 4 : le loup-garou de la mauvaise réponse",
        "body": "Une participante donne une réponse erronée, deux collègues sourient. « Désolée, c'était idiot. » La prochaine fois, elle hésitera à parler. Essayez plutôt : « C'est une confusion assez fréquente. Voyons ce que donnerait cette solution en pratique. » Analysez la réponse et faites découvrir comment l'améliorer. Il ne s'agit pas de prétendre que tout est juste, mais de corriger sans ridiculiser. Un retour d'information utile explique ce qui manque dans le raisonnement et ce qui permet de progresser, au lieu de juger la personne. Le Conseil scientifique de l'éducation nationale souligne le rôle du feedback dans les apprentissages."
      },
      {
        "title": "🕸️ Apparition n° 5 : huit participants, trois niveaux",
        "body": "Trois participants terminent en cinq minutes, deux avancent normalement, trois peinent dès le départ. La fameuse homogénéité du groupe a disparu. L'antidote : une mission commune avec plusieurs degrés de difficulté. Niveau essentiel : identifier une situation et proposer une première réponse. Niveau approfondissement : comparer deux stratégies et leurs limites. Niveau défi : répondre à un scénario complexe avec plusieurs contraintes. Tout le monde poursuit le même objectif, sans imposer le même rythme ni reconstruire trois formations entières. « Ceux qui ont fini, attendez les autres » n'a jamais constitué un exercice pédagogique passionnant."
      },
      {
        "title": "🦇 Apparition n° 6 : le participant qui ne veut pas jouer",
        "body": "« Nous allons faire un jeu de rôle ! » Une participante se crispe : « Je préfère ne pas jouer devant tout le monde. » Participer ne signifie pas accepter toutes les modalités. Selon l'objectif, proposez un travail en binôme, une observation commentée ou une analyse écrite. Mais ne perdez pas de vue la compétence : si elle doit être démontrée dans une situation pratique, l'écrit ne suffit pas toujours à l'évaluer. Dans ce cas, trouvez un autre cadre d'entraînement adapté. Adapter les modalités n'est pas renoncer à l'objectif ; et la formation n'est pas une audition de téléréalité."
      },
      {
        "title": "🧪 Le rituel anti-fantômes : une séquence de quinze minutes",
        "body": "Deux minutes pour présenter un problème professionnel précis. Trois minutes de réflexion individuelle. Quatre minutes d'échange en binôme. Quatre minutes de mise en commun. Deux minutes de vérification des acquis par une micro-application ou une question courte. Ces durées sont indicatives et non réglementaires. La méthode s'adapte à une formation en bureautique, management, relation client ou sécurité. Elle ne nécessite ni logiciel coûteux ni spectacle son et lumière : une consigne claire, un cas pertinent et quelques feuilles peuvent suffire."
      },
      {
        "title": "🎁 Bonus : une salle bruyante n'est pas toujours une salle qui apprend",
        "body": "Un groupe enthousiaste peut participer à un jeu sans acquérir la compétence attendue. À l'inverse, une personne discrète peut progresser beaucoup. Terminez chaque séquence par une petite démonstration : reformuler une demande client, utiliser une fonction Excel, justifier une réponse à un désaccord ou repérer un risque dans un scénario. Comparez le résultat à l'objectif de formation. Notez ensuite trois observations utiles : ce qui a fonctionné, ce qui a coincé et ce que vous changerez. Une démarche d'amélioration continue est plus utile qu'un roman de commentaires vagues. Ressources de référence : Conseil scientifique de l'éducation nationale, « Qu'est-ce que le feedback ? » ; Réseau Canopé, « Pédagogies actives », 26 novembre 2024 ; Éduscol, démarche Qualéduc."
      }
    ],
    "conclusion": "17 h 02. La formation est terminée. Mathilde comprend que ses apprenants n'étaient pas des fantômes, mais des personnes différentes : certains avaient besoin de réfléchir, d'autres de s'exprimer ou d'être rassurés. Son travail n'était pas de les faire tous participer de la même manière, mais de leur permettre d'apprendre. Elle éteint le vidéoprojecteur. Une dernière voix s'élève : « Excusez-moi, j'ai une petite anecdote à raconter… » Le vampire du temps de parole a survécu. Et manifestement, il a encore faim. L'équipe Selen Éditions. Article pédagogique du 30 octobre 2026. Les exemples sont fictifs ; les méthodes s'adaptent aux objectifs et aux publics."
  },
  {
    "slug": "qualiopi-novembre-2026-nouveau-referentiel-checklist",
    "title": "Qualiopi change dimanche : opération sauvetage avant minuit 🎃",
    "category": "Qualiopi",
    "excerpt": "Le référentiel Qualiopi évolue le 1er novembre 2026. Cinq missions concrètes et un bonus CFA pour préparer les nouvelles exigences sans brûler vos classeurs.",
    "publishedAt": "2026-10-29",
    "coverImage": "/plum.png",
    "coverAlt": "Plume de la Gazette Selen sur fond parchemin",
    "featured": true,
    "readingTime": "8 min",
    "introduction": "Mardi 27 octobre, 9 h 12. Thomas, formateur indépendant et certifié Qualiopi, apprend que le référentiel évolue dimanche 1er novembre. Il voit déjà son week-end : des procédures à réécrire, des classeurs à reconstruire et une imprimante en panne samedi soir. Faut-il vraiment tout recommencer ? Non. Le décret n° 2026-728 du 1er août 2026, publié au Journal officiel du 4 août, maintient les sept critères, actualise plusieurs indicateurs et ajoute un indicateur 33 pour l'apprentissage. Cinq missions pratiques pour cibler les changements applicables, sans sacrifier son café ni son week-end.",
    "sections": [
      {
        "title": "🧟 Avant de commencer : pas besoin de reconstruire Qualiopi",
        "body": "Le nouveau référentiel entre en vigueur le 1er novembre 2026. Les sept critères sont conservés. Les 33 indicateurs ne concernent pas tous chaque prestataire : l'indicateur 33 vise l'apprentissage. Votre certificat ne disparaît pas automatiquement dimanche. L'objectif est de repérer les nouvelles exigences pertinentes pour vos prestations et de préparer vos futurs audits. Source officielle : décret n° 2026-728 du 1er août 2026, Légifrance, https://www.legifrance.gouv.fr/loda/id/JORFTEXT000054608509/."
      },
      {
        "title": "🔎 Mission n° 1 : le détecteur de promesses commerciales",
        "body": "Thomas découvre sur son site « notre formation vous garantit une réussite immédiate ». Un peu ambitieux, Thomas. L'indicateur 1 impose une information publique accessible, détaillée, vérifiable et sans promesse trompeuse. L'indicateur 2 renforce la transparence sur les modalités de calcul des résultats. Une formation affiche 100 % de satisfaction, mais deux répondants seulement sur trois participants : sans méthode ni dénominateur, le chiffre risque d'induire en erreur. Astuce Selen : pour chaque statistique diffusée, conservez la période, le nombre de personnes concernées, le nombre de répondants, le calcul et la date d'actualisation. Un résultat modeste mais explicable vaut mieux qu'une médaille commerciale obtenue par prestidigitation."
      },
      {
        "title": "💻 Mission n° 2 : le fantôme des modules à distance",
        "body": "Thomas envoie des liens et conserve des captures d'écran. Mais pour ses modules autonomes, comment vérifier un suivi réel ? L'indicateur 19 renforce l'effectivité du suivi des modules à distance. Le texte prévoit également, au-delà d'un seuil d'intervenants fixé par arrêté, un référent pédagogique : n'inventez pas ce seuil. Astuce Selen : réunissez trois types de traces adaptées au parcours, par exemple accès au module, activité réalisée et évaluation ou production. Un lien envoyé ne prouve pas qu'une compétence a été travaillée. Ce sont des pistes de preuves, non une liste réglementaire universelle."
      },
      {
        "title": "🚨 Mission n° 3 : le signalement du vendredi à 16 h 55",
        "body": "Votre livret d'accueil précise les horaires, mais qui traite un signalement de violence, de harcèlement ou de discrimination ? L'indicateur 12 renforce explicitement la prévention et le traitement de ces situations pendant la formation. Les indicateurs 14 et 15 précisent des exigences spécifiques pour les CFA. Testez une situation fictive : un apprenant vous signale un comportement grave juste avant le week-end. Qui reçoit les faits, quelles mesures immédiates peuvent être prises, qui contacter, comment préserver la confidentialité et documenter le suivi ? Une procédure courte et réellement applicable vaut mieux qu'une interdiction solennelle dans un règlement jamais consulté. L'enjeu est d'abord de protéger les personnes."
      },
      {
        "title": "📑 Mission n° 4 : le sous-traitant mystérieux",
        "body": "Thomas travaille avec une formatrice compétente et conserve son CV. Leur contrat se contente pourtant de dire « formation réalisée selon les modalités convenues ». L'indicateur 27 exige davantage de traçabilité du respect du référentiel dans les contrats de sous-traitance et les situations concernées. Astuce Selen : une fiche de mission indique objectifs, responsabilités, documents attendus, remontée des incidents et modalités de suivi qualité. Vérifiez sa cohérence avec le contrat et la prestation réelle. La confiance entre professionnels et une formalisation sérieuse peuvent parfaitement cohabiter."
      },
      {
        "title": "🧠 Mission n° 5 : la boule de cristal des risques",
        "body": "L'indicateur 32 demande de prendre en compte l'analyse des risques pour la qualité des formations dans la démarche d'amélioration continue. Non, Thomas n'a pas besoin de prévoir l'avenir. Commencez par trois risques concrets : formateur indisponible, plateforme à distance en panne, besoin d'adaptation identifié trop tard. Pour chacun, consignez conséquence, prévention, responsable et suivi. Exemple : pour une panne de plateforme, tester une solution alternative ; pour un absent, prévoir un report ou remplacement encadré. Ce petit registre est un outil conseillé par Selen, pas un modèle obligatoire. Si votre risque principal est un ordinateur qui fait un bruit d'hélicoptère, vous tenez peut-être déjà une piste."
      },
      {
        "title": "🎓 Bonus CFA : le trente-troisième invité",
        "body": "L'indicateur 33 s'applique aux prestations par apprentissage. Il demande d'évaluer les contenus et les enseignements par les apprenants, distinctement de leur satisfaction générale, de partager les résultats avec les équipes pédagogiques et d'alimenter une amélioration continue dont l'efficacité est mesurée périodiquement. « Les apprenants aiment-ils la formation ? » et « Les contenus et méthodes les aident-ils à apprendre ? » sont deux questions différentes. On ne juge pas un restaurant uniquement à la couleur de ses serviettes."
      },
      {
        "title": "🎁 La checklist de contrôle express",
        "body": "1. Vérifier la communication publique et le calcul des résultats. 2. Examiner le suivi effectif des modules à distance. 3. Vérifier la prévention et le traitement des violences, harcèlements et discriminations. 4. Revoir les contrats et le suivi des sous-traitants si concernés. 5. Documenter les risques qualité. 6. Pour les CFA, examiner l'évaluation spécifique des contenus et des enseignements. Cette liste sert à prioriser les vérifications et ne remplace pas l'examen exhaustif des dispositions applicables."
      }
    ],
    "conclusion": "Dimanche approche. Thomas n'a ni brûlé ses classeurs ni acheté douze logiciels. Il a identifié les exigences pertinentes, décidé quoi vérifier et commencé à documenter les adaptations. Tout ne sera pas nécessairement réglé en cinq jours, mais les bonnes questions sont posées. Son dernier dossier s'appelle quand même « Qualiopi_nouveau_référentiel_VRAIMENT_FINAL_2026 ». Quand un confrère lui demande si un nouveau guide de lecture va paraître, Thomas ferme son ordinateur : « Lundi. On verra ça lundi. » L'équipe Selen Éditions. Article actualisé pour publication le 29 octobre 2026. Décret officiel : https://www.legifrance.gouv.fr/loda/id/JORFTEXT000054608509/ . Les propositions de méthode sont des conseils pratiques, pas des obligations réglementaires supplémentaires."
  },
  {
    "slug": "cybermois-2026-securiser-dossiers-apprenants-formateurs",
    "title": "Cybermois 2026 : votre dossier apprenant est-il une passoire numérique ?",
    "category": "Gestion quotidienne",
    "excerpt": "Sept pièges numériques qui guettent les formateurs indépendants : partages trop larges, phishing, faux RIB, sauvegardes et données des apprenants.",
    "publishedAt": "2026-10-20",
    "coverImage": "/plum.png",
    "coverAlt": "Plume sur parchemin, illustration de la Gazette Selen",
    "featured": true,
    "readingTime": "8 min",
    "introduction": "Mardi 20 octobre, 8 h 42. Nina, formatrice indépendante depuis huit mois, reçoit un message : « URGENT : votre espace professionnel sera suspendu dans 24 heures. » Elle approche sa souris du lien… puis hésite. Heureusement : octobre est le Cybermois, campagne nationale de sensibilisation à la cybersécurité du 1er au 31 octobre 2026. Un formateur indépendant manipule noms, coordonnées, évaluations et dossiers d'inscription. Profitons-en pour visiter sept pièges numériques, sans transformer votre salon en centre de cybersécurité.",
    "sections": [
      {
        "title": "🕳️ Piège n° 1 : le dossier partagé avec toute la planète",
        "body": "Nina partage le dossier d'une session en sélectionnant « Toute personne disposant du lien ». Pratique : le client ouvre les fichiers sans compte. Moins pratique : toute personne recevant le lien pourrait aussi y accéder. Le problème n'est pas le cloud, mais les droits d'accès. Le test de l'invité surprise : ouvrez les paramètres de partage d'un dossier contenant des données personnelles, contrôlez qui y accède et retirez les accès devenus inutiles. Un apprenant n'a pas besoin de voir les évaluations des autres, ni un ancien intervenant de conserver l'accès aux archives."
      },
      {
        "title": "📧 Piège n° 2 : le mail collectif qui présente tout le monde",
        "body": "Nina envoie une information aux douze participants en plaçant les douze adresses dans « À ». Chacun découvre les coordonnées des onze autres : réseautage imposé, non merci. Lorsque les destinataires n'ont pas à se connaître, utilisez Cci ou un envoi individualisé. Un résultat d'évaluation, lui, mérite une transmission personnelle et sécurisée. Écrire CONFIDENTIEL en majuscules n'est pas une technologie de protection. Référence : CNIL, recommandations sur la protection des données lors des formations numériques."
      },
      {
        "title": "🔑 Piège n° 3 : le mot de passe qui sert absolument partout",
        "body": "Messagerie, facturation, plateforme pédagogique : Nina utilise presque le même mot de passe pour tout. Si un service est compromis, les autres sont exposés. Commencez par sécuriser trois comptes vitaux : messagerie (qui sert souvent à réinitialiser les autres mots de passe), espace de gestion des formations, espace bancaire ou de facturation. Utilisez des mots de passe uniques, un gestionnaire dédié et l'authentification multifacteur lorsqu'elle est disponible. Le Post-it collé à l'écran est facile à retrouver, précisément le problème."
      },
      {
        "title": "💸 Piège n° 4 : le faux RIB qui ressemble au vrai",
        "body": "Un fournisseur vous annonce ses nouvelles coordonnées bancaires dans un message très convaincant. La fraude au faux RIB consiste précisément à usurper l'identité d'un créancier pour détourner un virement. Avant de modifier un RIB, contactez votre interlocuteur par un canal déjà connu et fiable, et non avec les seules coordonnées fournies dans le message. Cybermalveillance.gouv.fr a mis à jour ses conseils sur cette escroquerie le 14 octobre 2026. Un virement détourné ne se corrige pas toujours avec un deuxième mail."
      },
      {
        "title": "💾 Piège n° 5 : la sauvegarde qui n'a jamais été testée",
        "body": "Nina pense que son ordinateur sauvegarde tout : elle a vu une petite icône verte il y a quelques mois. Mais saurait-elle restaurer ses programmes si son ordinateur tombait en panne avant une session ? Faites le test du lundi catastrophique : restaurez un document non sensible depuis la sauvegarde, puis identifiez les fichiers indispensables à la continuité de l'activité. La synchronisation ne remplace pas toujours une sauvegarde indépendante : une suppression peut se répercuter sur plusieurs appareils. Prévoyez des copies protégées et vérifiez leur restauration. Référence : Cybermalveillance.gouv.fr, prévention des rançongiciels, mise à jour du 7 mai 2026."
      },
      {
        "title": "🖥️ Piège n° 6 : l'ordinateur pédagogique qui sait tout",
        "body": "Pour un exercice Excel, Nina utilise une feuille avec de vrais noms, adresses et montants issus de ses dossiers. C'est réaliste, mais beaucoup trop. Constituez plutôt une bibliothèque de jeux de données entièrement fictifs : entreprises imaginaires, personnes inventées, transactions de démonstration. Vous pourrez les réutiliser dans vos supports et captures d'écran sans exposer vos clients. En visioconférence, fermez les fenêtres inutiles et les notifications avant de partager l'écran. Une démonstration ne devrait pas devenir une visite guidée de votre comptabilité."
      },
      {
        "title": "🚨 Piège n° 7 : la fuite que personne ne sait gérer",
        "body": "Nina découvre qu'un dossier apprenant était accessible sans autorisation. Elle ferme l'accès : et ensuite ? Le RGPD impose de documenter les violations de données personnelles. Lorsque la violation est susceptible d'engendrer un risque pour les droits et libertés, le responsable de traitement doit la notifier à la CNIL dans les meilleurs délais et, si possible, sous 72 heures après en avoir pris connaissance. Si le risque est élevé, l'information des personnes concernées peut être requise, sous réserve des exceptions applicables. Toute erreur n'impose pas automatiquement une notification, mais elle doit être évaluée. Préparez une fiche réflexe : personnes à contacter, sécurisation, collecte des faits, évaluation du risque et décision documentée. Le kit Cybermois 2026 comporte une ressource CNIL/Cybermalveillance sur la réaction aux violations. Source : CNIL, « Notifier une violation de données personnelles », et Cybermalveillance.gouv.fr, kit Cybermois 2026 (1er octobre 2026)."
      },
      {
        "title": "🧪 Le défi Selen : quinze minutes pour vérifier votre sécurité",
        "body": "Cinq tests de trois minutes, sans prétendre réaliser un audit complet : (1) vérifier les droits d'accès d'un dossier apprenant ; (2) vérifier l'authentification multifacteur de votre messagerie ; (3) contrôler la confidentialité d'un envoi collectif ; (4) restaurer un document de test non sensible ; (5) retrouver votre procédure en cas d'incident. Ces quinze minutes sont une idée pédagogique Selen, pas une obligation réglementaire. Si vous repérez une faiblesse, prenez une mesure concrète et vérifiez qu'elle fonctionne."
      }
    ],
    "conclusion": "Nina décide de ne pas cliquer sur le lien menaçant et consulte directement le site officiel par son adresse habituelle. Aucune suspension : seulement un hameçonnage. Elle sécurise ses comptes, vérifie ses partages, et retourne préparer sa formation. La cybersécurité n'est pas réservée aux grandes entreprises : elle commence aussi dans le bureau d'un indépendant, même entre une imprimante capricieuse et une tasse de café oubliée. L'équipe Selen Éditions. Article d'information générale daté du 20 octobre 2026 ; mesures à adapter aux risques et aux obligations propres à chaque organisme. Ressources : https://www.cybermalveillance.gouv.fr/ ; https://www.cnil.fr/ ."
  },
  {
    "slug": "facturation-electronique-2026-formateurs-independants",
    "category": "Gestion quotidienne",
    "title": "Facturation électronique : votre PDF va-t-il finir au musée ?",
    "excerpt": "Depuis septembre 2026, la facture électronique chamboule les habitudes. Franchise en base, exonération formation, plateformes et échéances : le guide anti-panique des formateurs.",
    "publishedAt": "2026-10-13",
    "coverImage": "/plum.png",
    "coverAlt": "Plume sur fond parchemin, Gazette Selen",
    "featured": true,
    "readingTime": "8 min",
    "introduction": "Gérard est formateur indépendant. Il crée ses factures sur ordinateur, les enregistre en PDF et les envoie par mail. Simple, efficace… sauf quand il oublie la pièce jointe. Puis arrive septembre 2026, et son fournisseur annonce une nouvelle facturation électronique. « Mais mes factures sont déjà électroniques ! » Pas exactement, Gérard. Bienvenue dans la réforme où deux formateurs qui ne facturent pas la TVA peuvent avoir des obligations différentes.",
    "sections": [
      {
        "title": "📬 Le PDF de Gérard n'est pas une facture électronique au sens de la réforme",
        "body": "Une facture électronique soumise à la réforme doit circuler dans un format structuré ou mixte autorisé, via une plateforme agréée, directement ou grâce à une solution compatible. Un PDF ordinaire joint à un mail n'est pas suffisant pour les opérations concernées. Votre vieux PDF n'est pas interdit dans toutes les situations ; il ne peut simplement pas remplacer le nouveau circuit lorsqu'il devient obligatoire. Source officielle : https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises."
      },
      {
        "title": "📅 Deux dates à noter, sans attendre la veille",
        "body": "Depuis le 1er septembre 2026, les entreprises établies en France et assujetties à la TVA, y compris en franchise en base, doivent pouvoir recevoir les factures électroniques concernées. Les grandes entreprises et ETI ont commencé à les émettre pour les opérations entrant dans le dispositif. À compter du 1er septembre 2027, l'obligation d'émission s'étendra notamment aux PME, TPE et micro-entreprises. Le 9 octobre 2026, le ministère annonçait qu'au 4 octobre, 75 % des entreprises déclarant la TVA avaient désigné une plateforme de réception. Si vous n'avez encore rien prévu, vous n'êtes manifestement pas le seul, mais il est temps de regarder votre situation. Sources : https://www.economie.gouv.fr/actualites/facturation-electronique-entre-entreprises-coup-denvoi-de-la-reforme ; https://presse.economie.gouv.fr/facturation-electronique-le-premier-comite-dresse-le-bilan-du-deploiement-et-engage-la-preparation-de-2027/."
      },
      {
        "title": "🎭 Trois formateurs, trois situations fiscales",
        "body": "Gérard est micro-entrepreneur en franchise en base de TVA : il ne facture pas de TVA, mais il reste assujetti et concerné par le nouveau dispositif pour ses opérations dans le champ. Sophie possède l'attestation permettant l'exonération spécifique de ses prestations de formation professionnelle continue, au titre de l'article 261, 4-4° a du CGI : les opérations effectivement exonérées, dispensées de facturation fiscale et relevant des articles 261 à 261 E sont exclues de l'obligation d'émission électronique et d'e-reporting au titre de ces opérations. Elle peut néanmoins être tenue de recevoir les factures électroniques de ses fournisseurs concernés. Karim réalise à la fois des formations exonérées et du conseil : il doit qualifier chaque prestation séparément. La vraie question n'est donc pas « Est-ce que je mets de la TVA sur ma facture ? » mais « Pourquoi n'en mets-je pas, et quelle opération est-ce que je facture ? ». Les règles spécifiques à chaque situation doivent être vérifiées. Source : https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises."
      },
      {
        "title": "🕵️ NDA et exonération : les faux jumeaux",
        "body": "Le numéro de déclaration d'activité d'un formateur (NDA) n'est pas l'attestation fiscale d'exonération de TVA. Pour un organisme privé, l'exonération spécifique de formation professionnelle continue suppose le respect de conditions réglementaires, notamment l'attestation administrative. Ne déduisez jamais votre statut TVA du seul NDA, et ne considérez pas que toute activité de conseil devient exonérée parce que vous êtes formateur. Le bon réflexe : distinguer franchise en base, exonération au titre de l'article 261 et activités éventuellement soumises au droit commun. En cas de doute, demandez confirmation au service des impôts ou à votre comptable."
      },
      {
        "title": "🎮 Mini-jeu : qui passe par la nouvelle tuyauterie ?",
        "body": "Situation A : vous êtes micro-entrepreneur en franchise en base et facturez du conseil à une société française : en principe, facture électronique B2B à l'échéance applicable en 2027. Situation B : vous facturez un particulier : pas de facture électronique B2B à lui transmettre, mais selon l'opération des obligations d'e-reporting peuvent s'appliquer. Situation C : une prestation de formation réellement exonérée sous l'article 261, et dispensée de facturation fiscale : elle est exclue de l'émission électronique et de l'e-reporting correspondants. Situation D : un grand fournisseur doit vous envoyer une facture électronique : vérifiez votre capacité à la recevoir sur une plateforme agréée. Score parfait ? Vous méritez une pause café, pas un abonnement de plus."
      },
      {
        "title": "🧰 La boîte à outils anti-panique",
        "body": "1. Identifiez votre régime fiscal et classez les prestations selon leur traitement réel. 2. Vérifiez que vous pouvez recevoir les factures électroniques via une plateforme agréée ; consultez la liste officielle plutôt qu'un argumentaire commercial. 3. Interrogez votre logiciel existant avant de payer un nouvel abonnement. 4. Vérifiez les données d'identification de vos clients professionnels, notamment les SIREN. 5. Documentez en une page qui reçoit, contrôle, archive et corrige les factures. Pour un formateur qui émet peu de factures, une solution proportionnée vaut mieux qu'une usine à gaz avec abonnement premium et tableau de bord intergalactique. Sources : https://www.economie.gouv.fr/actualites/facturation-electronique-la-liste-des-101-premieres-plateformes-agreees-est-disponible ; https://www.economie.gouv.fr/entreprises/quest-ce-que-lannuaire-de-la-facturation-electronique."
      },
      {
        "title": "🎁 Le bonus Selen : la réforme ne réglera pas vos impayés",
        "body": "Profitez de votre réorganisation pour examiner les dix dernières factures : combien ont été réglées à temps ? Combien ont nécessité une relance ? Avez-vous reçu un bon de commande et les bonnes coordonnées comptables avant la prestation ? Un format électronique n'empêchera pas le client de payer tard. Une démarche utile consiste à confirmer l'adresse de facturation, la référence de commande et les délais de paiement dès la contractualisation, puis à suivre les échéances. La réforme est une occasion de simplifier votre travail, pas une raison de collectionner les outils."
      }
    ],
    "conclusion": "Gérard a compris : la franchise en base et l'exonération spécifique de formation ne sont pas interchangeables ; la réception est déjà concernée depuis septembre 2026 et l'émission des petites structures suit en 2027 pour les opérations pertinentes. Son PDF « Facture_2026_finale.pdf » n'est pas mort, mais il n'est plus roi partout. Avant de souscrire quoi que ce soit, vérifiez votre régime, vos opérations et votre plateforme. Et si vous vous y prenez avant la veille de l'échéance, c'est presque une révolution administrative. L'équipe Selen Éditions. Article d'information générale au 13 octobre 2026 ; les obligations dépendent du régime fiscal et des opérations concernées."
  },
  {
    "slug": "preuves-qualiopi-enquete-documents-formation",
    "title": "Qualiopi : enquête sur les preuves disparues 🕵️",
    "category": "Qualiopi",
    "excerpt": "Une convention introuvable, une présence impossible à prouver, des évaluations oubliées : cinq enquêtes pour retrouver les bonnes preuves Qualiopi sans collectionner les classeurs.",
    "publishedAt": "2026-10-10",
    "coverImage": "/plum.png",
    "coverAlt": "Une plume sur fond parchemin, illustration de la Gazette Selen",
    "featured": true,
    "readingTime": "8 min",
    "introduction": "Mardi, 9 h 17. Le café est chaud. Puis un mail demande les preuves de la session du 14 mars. Vous connaissez la formation : tout s'est bien passé. Mais votre dossier contient une convention non signée, trois questionnaires de satisfaction et « Nouveau document (7).pdf ». Bienvenue dans l'affaire des preuves disparues. Enquête sur cinq pièges qui rendent un audit inutilement stressant, avec des solutions applicables sans ouvrir quatorze tableaux Excel.",
    "sections": [
      {
        "title": "🔎 Affaire n° 1 : le crime du document parfait",
        "body": "Lieu du crime : le dossier Qualiopi. Pièce à conviction : une magnifique procédure de positionnement de six pages. L'auditeur demande : « Comment l'avez-vous appliquée sur cette session ? » Silence. La procédure explique ce qui devrait arriver ; la preuve montre ce qui s'est réellement passé. L'astuce Selen : posez trois questions pour chaque pratique importante. Qu'avions-nous prévu ? Qu'avons-nous fait ? Comment savons-nous que cela a fonctionné ? Exemple : besoin de positionnement identifié, questionnaire analysé, adaptation décidée, progression évaluée. Ne multipliez pas les PDF pour impressionner ; conservez des traces qui permettent d'expliquer vos décisions."
      },
      {
        "title": "🔎 Affaire n° 2 : Sophie, présente partout sauf dans les preuves",
        "body": "Le formateur se souvient très bien de Sophie, de ses questions et même de son anecdote sur Kevin, son collègue qui interprète librement les horaires. Pourtant, impossible de retrouver son justificatif de présence. Pour démontrer la réalisation, choisissez des traces adaptées à la modalité : émargement en présentiel, et, à distance, activités réalisées, travaux rendus, traces de suivi ou d'interactions. Un lien envoyé ne prouve pas, à lui seul, le suivi effectif. Le conseil : vérifiez la complétude des justificatifs au fil de la session, lorsque les oublis peuvent encore être corrigés. Ne créez jamais de fausse signature rétroactive. Si une pièce manque, documentez l'incident, recherchez les traces réellement disponibles et prenez une mesure corrective."
      },
      {
        "title": "🔎 Affaire n° 3 : le questionnaire de satisfaction qui ne servait à rien",
        "body": "Vingt-quatre questionnaires, 96 % de satisfaction et des smileys heureux. Mais une participante signale des exercices trop difficiles pour les débutants. Son commentaire a été classé sans suite. Verdict : recueillir un avis n'est pas encore améliorer la formation. Faites l'expérience du retour négatif : quand a-t-il été reçu, qui l'a examiné, quelle décision a été prise, qu'a-t-on changé et comment en vérifier l'effet ? Une critique analysée vaut parfois plus que vingt félicitations enterrées dans un dossier. Le taux de satisfaction ne remplace pas l'analyse ni le suivi des actions pertinentes."
      },
      {
        "title": "🔎 Affaire n° 4 : le mystérieux dossier aux 146 fichiers",
        "body": "« Convocation.pdf », « Convocation_finale.pdf », « Convocation_finale_definitive_BONNE_VERSION.pdf » : laquelle a été envoyée ? Le bon classement ne consiste pas seulement à ranger par type de fichier, mais à rattacher chaque document à une session et à l'événement réel qui l'a produit. Exemple fictif : 2 mars, convention transmise ; 4 mars, signée ; 5 mars, convocations envoyées ; 10 mars, positionnements analysés ; 14 mars, session réalisée ; 16 mars, évaluations exploitées ; 18 mars, pièces de fin transmises. Associez, quand c'est utile, une trace d'envoi ou de validation. Votre dossier doit raconter l'histoire de la formation, pas seulement abriter une collection de PDF."
      },
      {
        "title": "🔎 Affaire n° 5 : la preuve qui en disait beaucoup trop",
        "body": "Un organisme conserve de nombreux détails personnels, voire médicaux, pour montrer qu'un besoin particulier a été pris en compte. Mais la protection des données exige de limiter les informations collectées à ce qui est nécessaire ; les données de santé appellent une vigilance particulière. Il est souvent suffisant de tracer le besoin d'aménagement, l'adaptation étudiée ou réalisée et le suivi, sans enregistrer une biographie confidentielle. Avant chaque collecte, demandez-vous : « Ai-je réellement besoin de cette information pour justifier ce qui a été fait ? » Plus de données n'est pas synonyme de meilleure preuve."
      },
      {
        "title": "🕵️ Le test des 90 secondes",
        "body": "Choisissez une session terminée au hasard, lancez un chronomètre et essayez de retrouver : le programme applicable, la convention ou le contrat, les éléments pertinents sur les besoins et le positionnement, les justificatifs de réalisation, les évaluations et les suites données aux retours. Six éléments retrouvés rapidement ? Votre classement semble pratique, mais leur cohérence reste à vérifier. Trois à cinq ? Quelques zones d'ombre. Deux ou moins ? Votre ordinateur possède probablement une vie secrète. Ces 90 secondes sont un défi d'organisation inventé par Selen, pas une exigence Qualiopi."
      },
      {
        "title": "💼 Le dossier parfait n'existe pas. Le dossier explicable, oui.",
        "body": "Une absence, une adaptation imprévue ou une évaluation insatisfaisante font parfois partie d'une session. Il ne faut ni les cacher ni inventer des traces. Une difficulté réellement repérée, traitée et suivie peut démontrer une capacité de pilotage. Cela n'efface toutefois pas automatiquement une éventuelle non-conformité. L'objectif reste de pouvoir expliquer les décisions prises, les dates et les preuves existantes. Chez Selen Éditions, nous préférons un suivi sincère et exploitable à une montagne de modèles vides."
      }
    ],
    "conclusion": "Fin de l'enquête : pour chaque preuve, sachez répondre à quatre questions : quoi, quand, pour qui et comment le sait-on ? Ajoutez-en une cinquième : qu'en avons-nous fait ? La convention est retrouvée, les évaluations sont exploitées, le café est froid mais l'affaire est résolue. Quant au fichier « FINAL_V3_BIS », il peut enfin prendre sa retraite. L'équipe Selen Éditions. Cet article donne des conseils généraux ; les preuves attendues dépendent des indicateurs Qualiopi applicables et des modalités des prestations. Il n'existe pas de liste universelle de documents obligatoire pour chaque session."
  },
  {
    "slug": "devenir-formateur-independant-2026",
    "category": "Gestion quotidienne",
    "title": "Devenir formateur indépendant : félicitations, vous venez de débloquer le niveau administratif !",
    "excerpt": "Le guide de survie du formateur indépendant : clients, NDA, Qualiopi, documents, rentabilité et BPF, avec de vraies astuces et quelques boss à affronter.",
    "publishedAt": "2026-10-10",
    "coverImage": "/plum.png",
    "coverAlt": "Une plume de rédaction sur fond parchemin",
    "featured": true,
    "readingTime": "9 min",
    "introduction": "Vous avez décidé de devenir formateur indépendant. Vous vous imaginez face à un groupe captivé, transmettant votre expertise avec passion. Magnifique. Mais avant de savourer cette liberté, vous venez de débloquer un univers parallèle : celui de l'administration de la formation professionnelle. Ses habitants parlent NDA, BPF et Qualiopi, et possèdent parfois plusieurs versions du même formulaire. Ne fuyez pas : voici votre guide de progression, avec quelques raccourcis pour éviter les combats inutiles.",
    "sections": [
      {
        "title": "🎯 Niveau 1 : transformer votre expertise en véritable formation",
        "body": "Votre mission : créer une formation que vos clients voudront acheter et que vos apprenants pourront réellement utiliser. Gérard, commercial redoutable, vendrait un parasol à un Breton en novembre. Sa formation « Les secrets de la vente » promet de « rester motivé » et « être convaincant ». Merci Gérard. Mais que fait un participant lorsque son client dit « c'est trop cher » ? Le pouvoir spécial : concevoir à l'envers. Définissez ce que l'apprenant saura faire, imaginez une évaluation pratique pour le vérifier, puis bâtissez les séquences utiles. Par exemple : répondre à une objection commerciale, s'exercer lors d'une simulation, apprendre à questionner, reformuler et argumenter. Vous éviterez 87 diapositives qui n'apprennent rien à personne."
      },
      {
        "title": "🛒 Niveau 2 : trouver un client avant de fabriquer un empire",
        "body": "Votre mission : vérifier qu'une vraie personne est prête à payer. Logo, site, charte graphique, logiciel, nouveau logo… trois mois plus tard, vous avez une très belle identité visuelle et zéro client. Lancez plutôt l'enquête des cinq clients : demandez à cinq entreprises cibles quelle difficulté leur fait perdre du temps, ce qu'elles ont déjà essayé, et quelles conséquences concrètes ce problème entraîne. Ne demandez pas simplement si votre formation semble intéressante. Les compliments sont gratuits ; les achats, nettement moins. Cherchez un problème fréquent, coûteux ou particulièrement pénible à résoudre."
      },
      {
        "title": "📜 Niveau 3 : affronter le gardien du NDA",
        "body": "Votre mission : déclarer votre activité au bon moment. Une fois l'entreprise immatriculée et votre première prestation de formation professionnelle contractualisée, vous devez normalement déposer la déclaration d'activité dans les trois mois suivant la conclusion de votre première convention ou de votre premier contrat de formation professionnelle. La démarche se fait auprès de l'administration compétente, notamment par Mon activité formation. Oui, il faut donc déjà un premier contrat pour demander le numéro : l'énigme est prévue par les textes. Attention, le numéro de déclaration d'activité (NDA) n'est ni un agrément de l'État ni une médaille de qualité. Votre objet magique : un dossier de première vente prêt à l'avance avec programme, modèle contractuel adapté, modalités de réalisation et d'évaluation, conditions commerciales. Ainsi, quand un client veut commencer lundi, vous ne découvrez pas le Code du travail vendredi à 18 h."
      },
      {
        "title": "🐉 Niveau 4 : Qualiopi, le dragon aux indicateurs",
        "body": "Votre mission : savoir si vous devez vraiment affronter le dragon dès maintenant. Qualiopi n'est pas obligatoire pour toute prestation de formation. La certification est notamment exigée pour accéder aux financements publics ou mutualisés relevant de son champ ; les dispositifs comme le CPF peuvent comporter d'autres conditions particulières. Si vos clients financent directement vos formations sans ces fonds, vous pouvez généralement démarrer sans certification. Avant d'investir, faites l'épreuve du trésor : combien de clients auraient besoin de ces financements ? Quel chiffre d'affaires additionnel pouvez-vous raisonnablement prévoir ? Additionnez le coût des audits, de la préparation et du temps de suivi. Acheter la certification sans stratégie commerciale, c'est un peu acheter un camion frigorifique avant de savoir si vous vendrez des glaces. Même sans Qualiopi, prenez de bonnes habitudes : besoins, objectifs, suivi, évaluations et traitement des retours, sans créer un musée du justificatif."
      },
      {
        "title": "🗂️ Niveau 5 : échapper au labyrinthe des documents",
        "body": "Mardi, 9 h 12. Un client vous demande l'attestation de Sophie. À 9 h 47, vous explorez toujours « Formation_final_V3_BIS ». Le raccourci : organiser les dossiers par session et conserver une architecture constante. Avant : contractualisation, programme, inscription, besoins et positionnement. Pendant : preuves de réalisation adaptées, suivi et éventuels ajustements. Après : évaluations, attestations, retours, facturation et clôture. Surtout, votre dossier doit raconter ce qui s'est passé : qui a reçu quoi, quand, qui doit signer et quelle action reste en attente. Mini-défi : si l'on vous demande demain la preuve qu'un participant a effectivement suivi une session, pouvez-vous la retrouver en moins de deux minutes ? Sinon, voilà un chantier utile, même sans audit en vue."
      },
      {
        "title": "💸 Niveau 6 : découvrir que 700 € ne font pas 100 € de l'heure",
        "body": "Vous facturez 700 € une journée de sept heures : 100 € l'heure, pensez-vous. Sauf qu'il y a aussi quatre heures de préparation, deux heures d'échanges avec le client, deux heures d'administration et une heure de correction. Au total : seize heures consacrées à la prestation, soit 43,75 € de chiffre d'affaires par heure réellement travaillée, avant charges, impôts et frais. Le cheat code : chronométrez vos cinq premières missions et distinguez animation, préparation, relation client, déplacement et administratif. Vous verrez quelles prestations sont rentables, quels tarifs revoir et quelles tâches simplifier. Une tâche non facturée séparément n'est pas gratuite. Vous avez aussi le droit d'avoir une vie après les feuilles d'émargement."
      },
      {
        "title": "📊 Niveau 7 : le BPF, ce boss annuel qu'on préfère voir venir",
        "body": "Les organismes de formation déclarés doivent transmettre chaque année leur bilan pédagogique et financier (BPF), qui retrace notamment l'activité réalisée. L'absence de transmission peut rendre caduque la déclaration d'activité. Plutôt que de devenir détective privé de vos propres factures, enregistrez dès chaque session les données nécessaires : prestations, heures, stagiaires et éléments financiers pertinents, correctement qualifiés. Le bouclier anti-panique : ne préparez pas un tableau spécial BPF en urgence une fois par an ; faites en sorte que le suivi courant permette d'en extraire les chiffres."
      },
      {
        "title": "🏆 Niveau final : construire une activité qui ne vous dévore pas",
        "body": "Avec cinq sessions, tout semble gérable. Avec quinze sessions, plusieurs clients et des échéances qui se croisent, c'est une autre histoire. Le secret n'est pas de travailler toujours plus, mais de ne pas réinventer l'organisation à chaque formation. Standardisez la création des dossiers et les tâches récurrentes ; automatisez ce qui est répétitif lorsque c'est pertinent ; conservez une validation humaine pour les décisions importantes. Chez Selen Éditions, nous défendons cette idée simple : l'administratif doit soutenir le formateur, pas devenir son activité principale. Votre inventaire de départ : une offre évaluée en pratique, une cible commerciale réelle, un statut adapté, des modèles contractuels, un calendrier pour le NDA, une stratégie de financement, un classement reproductible, un suivi de rentabilité et des données fiables pour le BPF."
      }
    ],
    "conclusion": "Vous avez terminé le tutoriel. Votre prochaine mission : décrocher vos premières formations sans laisser l'administration devenir votre métier à plein temps. Vous avez choisi ce métier pour transmettre, pas pour devenir champion du monde de la relance de signatures. Et si vous évitez « Suivi_definitif_V8_corrigé.xlsx », vous avez déjà gagné quelques points d'expérience. Article d'information générale, à adapter à votre situation et aux règles applicables en octobre 2026."
  },
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
