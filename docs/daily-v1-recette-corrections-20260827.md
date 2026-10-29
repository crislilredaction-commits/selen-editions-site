# Selen Daily V1 — Corrections issues de la recette du 27 août 2026

Ce document complète le cahier des charges Daily Lot 1. Il consigne uniquement les décisions validées pendant la recette utilisateur afin qu'elles soient intégrées aux prochains lots sans perdre le comportement déjà construit.

## Principes de recette

- Conserver la V1 simple et guidée.
- Réutiliser l'existant avant d'ajouter de nouveaux modèles ou de nouvelles tables.
- Le paramétrage autonome et le paramétrage accompagné doivent aboutir au même état métier final.
- Le grand bandeau d'information actuellement affiché en haut du premier paramétrage et de la création d'une formation est trop chargé. Ne pas le refondre avant d'avoir terminé la recette du dashboard client ; prévoir son remplacement dans un lot UX ultérieur.
- Les corrections de recette peuvent être développées par lots indépendants et réversibles. Aucun document officiel ne doit être publié avant validation agent lorsque cette validation est requise par le workflow existant.

## Premier paramétrage autonome

### Identité et pièces de l'organisme

- Remplacer le champ URL du logo par un upload d'image.
- Ne pas afficher d'explication métier complexe au client concernant le logo.
- Règle de génération documentaire : logo de l'organisme en haut à gauche, largeur maximale 50 mm.
- Ne pas proposer l'utilisation des propres modèles documentaires du client en V1.
- Selen fournit ses modèles éditables ; les modèles documentaires sont retirés du paramétrage initial.
- Avis de situation INSEE : upload PDF.
- Certificat Qualiopi : upload PDF lorsque l'organisme est certifié.
- Dernier BPF : upload PDF lorsqu'il existe.
- CV formateur : upload Word ou PDF.
- Supprimer la case « CV si Qualiopi ».
- Lorsque l'avis INSEE est fourni, éviter la ressaisie inutile du SIRET et de l'adresse. La cible UX est l'extraction/préremplissage puis vérification/correction par le client ; tant que l'extraction automatique n'est pas disponible, conserver une solution temporaire sûre et réversible sans dupliquer davantage les saisies.

### Formateur dirigeant

Ajouter la case « Le formateur est également le dirigeant de l'organisme ».

Si elle est cochée :

- reprendre automatiquement nom, prénom et email du dirigeant ;
- ne pas demander une nouvelle saisie de ces informations ;
- créer/compter néanmoins cette personne comme formateur ;
- maintenir l'import du CV formateur.

L'information relative à l'accès formateur devra expliquer clairement :

- ce que le formateur peut consulter et réaliser depuis son espace ;
- ce qu'il ne peut pas administrer ;
- à quel moment son accès est créé ;
- quand et comment les accès lui sont transmis.

### Interlocuteur plateforme

Ajouter la case « L'interlocuteur plateforme est le dirigeant ».

Si elle est cochée, reprendre automatiquement les coordonnées du dirigeant.

Texte d'aide cible : « Indiquez ici la personne qui sera la plus amenée à administrer l'organisme et ses activités depuis Selen. »

## Création d'une formation

### Présentation générale

- Le grand bandeau supérieur est trop chargé et inutile à ce stade. Son remplacement sera décidé après recette du dashboard client.
- Ajouter des aides contextuelles courtes, idéalement sous forme d'info-bulles, pour les champs qui nécessitent une règle métier ou Qualiopi.

### Objectif global et objectifs pédagogiques

Aide recommandée :

« Formulez l'objectif en décrivant ce que le participant devra être capable de faire à l'issue de la formation. Commencez de préférence par un verbe d'action à l'infinitif, par exemple : maîtriser, identifier, appliquer, réaliser, utiliser, analyser ou acquérir. Évitez les formulations trop vagues comme “savoir” ou “comprendre”, qui décrivent difficilement un résultat observable. »

### Prérequis

Aide Qualiopi :

« Si vous indiquez un prérequis, vous devrez pouvoir démontrer qu'il est vérifié pour chaque apprenant avant son entrée en formation. Indiquez uniquement les conditions réellement nécessaires pour suivre la formation. »

### Modalité

- Supprimer le champ « Précisions sur la modalité » du formulaire client V1.
- Conserver le choix Présentiel / Distanciel / Mixte et les données nécessaires en interne si elles sont déjà exploitées par les documents ou l'API.

### Moyens pédagogiques et techniques

L'aide doit orienter vers les moyens réellement utilisés :

« Décrivez les supports, outils, matériels et méthodes mobilisés pendant la formation : supports de cours, vidéoprojecteur, ordinateur, plateforme de visioconférence, logiciels, matériel professionnel, exercices, études de cas, mises en situation, démonstrations, travaux individuels ou collectifs. Précisez également la façon dont la théorie et la pratique sont alternées et les approches pédagogiques utilisées. »

### Tarif

- Le champ doit être présenté comme « Tarif TTC ».

### Contenu / programme

- Retirer le grand champ texte « Programme détaillé » / « Contenu » de la saisie client V1.
- Permettre l'import d'un programme existant au format Word ou PDF.
- Proposer en téléchargement le modèle de programme déjà créé pour le parcours NDA, afin que le client puisse l'utiliser comme trame s'il le souhaite.
- Conserver la validation Selen du programme avant publication lorsqu'elle fait déjà partie du workflow.

### Modalités d'évaluation

- Comportement actuel validé.

### Positionnement

Aide cible :

« Le positionnement est un questionnaire de connaissances réalisé avant la formation. Il permet d'évaluer le niveau de départ de l'apprenant et d'identifier d'éventuels besoins d'adaptation. Pour un organisme certifié Qualiopi, ce positionnement doit être prévu et tracé. »

- Conserver la création d'un questionnaire dans Selen.
- Permettre aussi l'import d'un questionnaire existant au format Word ou PDF.

### Coordonnées affichées sur les documents

Pour l'email, le téléphone et le site internet, préciser qu'il s'agit des coordonnées de l'organisme de formation destinées aux apprenants et qu'elles peuvent apparaître sur les documents générés.

Texte cible : « Indiquez les coordonnées de l'organisme de formation que les apprenants peuvent utiliser pour vous contacter. Elles pourront apparaître sur les documents générés par Selen. »

## Création de session

- La création d'une session ne doit plus être affichée dans la continuité immédiate du formulaire de création de formation.
- Prévoir une seconde page/étape dédiée après enregistrement de la formation.
- Réduire fortement la taille et la dominance visuelle du bouton actuel.
- Une formation reste un modèle réutilisable ; la session contient les dates, participants et éléments opérationnels.

## Anomalies bloquantes constatées pendant la recette

- Dans une question de positionnement à choix unique ou multiple, la saisie des options supprimait immédiatement les espaces et les retours à la ligne. La valeur brute doit rester éditable pendant la frappe ; le nettoyage des options ne doit intervenir qu'à la validation serveur.
- Le formulaire affichait un objectif principal, mais n'envoyait aucun tableau `learning_objectives` alors que l'API exige au moins un objectif pédagogique. Le formulaire doit proposer explicitement un ou plusieurs objectifs pédagogiques et transmettre les valeurs renseignées.
- Ces anomalies empêchant de créer la formation, elles rendent la poursuite de la recette impossible et doivent être corrigées dans le même lot que les ajustements validés ci-dessus.

# Corrections complémentaires de recette — découpage en lots

Les éléments ci-dessous sont ajoutés au cahier des charges comme décisions de recette. L'ordre des lots tient compte des dépendances métier : les corrections d'interface simples peuvent être réalisées rapidement, tandis que le workflow complet d'inscription et de déroulement d'une session doit rester cohérent de bout en bout.

## Lot A — Corrections immédiates du dashboard client et des accès

### Dashboard client

- Supprimer toute carte, raccourci ou mention « Paramétrage autonome » une fois le paramétrage terminé. Le paramétrage ne doit pas rester présenté comme une fonctionnalité courante du dashboard.
- Ajouter un bouton clairement identifiable « Se déconnecter » sur le dashboard Daily.
- Corriger le comptage et l'affichage des formateurs : tout formateur réellement enregistré pour l'organisme doit apparaître dans le dashboard et être comptabilisé correctement.
- Corriger la carte « À faire » afin que les documents obligatoires ou attendus mais non fournis génèrent bien une tâche visible avec lien direct vers la page permettant de les déposer.

### Accès aux espaces apprenants

- Les administrateurs de l'organisme et les formateurs autorisés doivent pouvoir ouvrir l'espace d'un apprenant directement depuis son dossier.
- L'accès doit reprendre les droits du rôle connecté : consultation ou intervention uniquement sur les éléments auxquels le rôle est autorisé.
- Le dossier apprenant devient le point d'entrée principal vers son portail, ses documents, évaluations, émargements, réclamations et historique de formation.

## Lot B — Générateur « Télécharger un dossier apprenant »

La fonctionnalité actuelle « Modèles de documents » doit être remplacée dans le dashboard par une entrée intitulée :

**Télécharger un dossier apprenant**

### Parcours attendu

À l'ouverture, afficher un formulaire permettant de :

1. choisir une formation existante ou en créer une ;
2. choisir une session existante ou en créer une ;
3. renseigner ou sélectionner les coordonnées de l'apprenant ;
4. renseigner, lorsque nécessaire, les informations entreprise/commanditaire et financeur ;
5. générer le dossier complet.

### Règles du générateur

- Reprendre le même principe et le même contenu que le générateur de dossiers de formation actuellement utilisé dans Studio.
- Le dossier téléchargé par le client doit contenir uniquement des PDF.
- Les informations de l'organisme de formation sont toujours celles de l'organisme Daily connecté : nom légal, SIRET, adresse, NDA, coordonnées et autres mentions nécessaires.
- Ces données organisme ne doivent jamais être librement modifiables dans le générateur client afin d'empêcher la génération de dossiers pour un autre organisme.
- Les données apprenant, entreprise, session et formation peuvent être renseignées ou reprises depuis Daily selon le contexte.
- Chaque document du dossier doit pouvoir recevoir ultérieurement une nouvelle version PDF importée manuellement sans écraser l'historique.
- Les modèles Word Selen restent téléchargeables pour usage hors ligne lorsqu'ils sont prévus, mais le générateur Daily produit des PDF.

## Lot C — Présence, distanciel asynchrone et preuves de réalisation

### Présentiel, mixte et distanciel synchrone

- Conserver les feuilles d'émargement lorsque la présence peut être attestée par signature.
- Le formateur doit retrouver dans son espace les feuilles d'émargement de tous les apprenants de sa session ainsi que les éléments qu'il doit signer lui-même.

### Distanciel asynchrone

- Ne pas demander de feuille d'émargement classique.
- Remplacer la preuve d'émargement par l'import d'une capture d'écran ou d'un justificatif des temps de connexion de l'apprenant.
- Cette preuve doit être rattachée à l'apprenant, à la session et à la formation et être exploitable ultérieurement dans Audit Live.
- Le statut de présence/réalisation doit tenir compte de cette preuve afin que les certificats ne soient pas émis sans élément de traçabilité suffisant.

## Lot D — Refonte du suivi Qualité

Le suivi Qualité doit devenir un espace documentaire et de pilotage réel de la démarche qualité de l'organisme.

### Procédures internes

Prévoir une bibliothèque structurée comprenant au minimum :

- procédure de gestion des documents ;
- procédure de prévention des absences et abandons ;
- procédure de gestion des abandons ;
- fiches de poste ;
- politique handicap ;
- contacts et ressources handicap : MDPH, AGEFIPH, ressources handicap et Cap emploi par région.

Ces contenus pourront être fournis sous forme de modèles Selen, de documents générés et/ou de documents propres à l'organisme selon la règle retenue pour chaque catégorie.

### Tableau de suivi qualité

Créer un tableau consolidé par organisme recensant notamment :

- notes globales et commentaires de satisfaction des apprenants ;
- notes globales et commentaires de satisfaction des formateurs ;
- notes globales et commentaires de satisfaction des entreprises/commanditaires ;
- aléas rencontrés ;
- difficultés remontées ;
- réclamations des apprenants ;
- réclamations des formateurs ;
- solutions ou actions correctives proposées ;
- améliorations effectivement mises en place par l'organisme de formation.

Le tableau doit permettre de conserver une chronologie et une traçabilité des actions d'amélioration.

### Accès Studio

- Studio doit pouvoir consulter le tableau qualité de chaque client Daily.
- Les agents autorisés doivent pouvoir le compléter et le mettre à jour.
- Les ajouts/modifications Studio doivent conserver l'auteur et la date afin que l'historique reste exploitable en audit.

## Lot E — Nettoyage et organisation Studio

### Dashboard Studio

- Supprimer la carte « Remboursements à traiter ».
- Supprimer la carte « Messages », qui fait doublon avec la messagerie dédiée.

### Remboursements

- Intégrer la gestion des demandes de remboursement dans le Support.
- Une demande de remboursement doit devenir un type ou un motif de dossier support, avec suivi de son état et historique.

### Attribution des dossiers Daily

- Permettre d'attribuer un dossier Daily à un agent.
- L'agent responsable doit être identifiable depuis le dossier Studio.
- Les tâches et notifications relatives à ce dossier doivent être adressées prioritairement à l'agent attribué.
- Prévoir la possibilité de réattribuer un dossier sans perdre l'historique des interventions.

## Lot F — Workflow agent/client : formation, inscription et préparation de session

Ce lot remplace les notifications trop granulaires par un workflow déclenché uniquement lorsque l'intervention de l'agent devient réellement nécessaire.

### Création d'une formation

- Lorsqu'un client crée une formation, l'agent reçoit une seule tâche de vérification.
- Le rôle de l'agent consiste à vérifier la cohérence et valider la formation.
- Il ne doit pas reconstruire la formation si les données client sont exploitables.

### Création d'une session

- La création d'une session par le client ne génère aucune notification agent.
- La session apparaît simplement dans le planning Studio.
- L'agent n'intervient qu'aux étapes métier suivantes.

### Réception d'un dossier d'inscription

Lorsqu'un dossier public d'inscription est complété :

1. l'agent reçoit une tâche pour traiter le dossier ;
2. l'agent crée ou complète la fiche apprenant à partir des informations reçues ;
3. le client accepte ou refuse l'inscription ;
4. si aucune date de formation n'était définie, le client indique la date ou rattache l'apprenant à une session ;
5. après validation de l'inscription par le client, l'agent reçoit la tâche suivante ;
6. l'agent met à jour la fiche de session avec les données utiles issues des dossiers des apprenants inscrits.

### Fiche de session enrichie

La fiche de session doit notamment présenter une synthèse des :

- attentes ;
- motivations ;
- niveau initial ;
- besoins d'adaptation ;
- prérequis et points nécessitant une vigilance particulière.

La synthèse doit être mise à jour lorsque de nouveaux apprenants sont validés dans la session.

### Déclenchement des accès apprenant

La validation de l'inscription par le client déclenche automatiquement :

- la création ou l'activation de l'accès apprenant ;
- l'envoi par email des accès à son portail ;
- l'ouverture de son dossier apprenant dans Daily.

### Documents à déposer dans l'espace apprenant

L'agent dépose ou valide dans l'espace apprenant :

- la convention de formation ;
- la convocation ;
- le livret d'accueil.

Chaque nouvelle tâche agent doit être créée uniquement au moment où l'étape précédente a été validée par l'acteur attendu, côté client ou côté agent.

### Principe général des notifications

- Une notification correspond à une action réellement attendue.
- Ne pas notifier l'agent pour une simple création de session ou un changement sans intervention requise.
- Une étape terminée déclenche la suivante lorsqu'une action devient possible.
- Les tâches d'un même dossier restent regroupées dans le dossier plutôt que multipliées en alertes indépendantes.

## Lot G — Déroulement de formation et fin de session

### Emargement et rappels

Pendant la formation :

- rappeler au formateur les émargements qu'il doit effectuer ;
- rappeler aux apprenants les signatures attendues ;
- pour le distanciel asynchrone, utiliser le mécanisme de preuve de connexion décrit dans le lot C plutôt qu'une signature classique.

### Dernier jour de formation

Le matin du dernier jour :

- rendre disponible l'évaluation de fin de formation dans l'espace apprenant ;
- rendre disponible le questionnaire de satisfaction apprenant ;
- envoyer un rappel par email à l'apprenant.

Le formateur doit avoir accès depuis son propre espace :

- aux émargements de la session ;
- à ses propres signatures/validations ;
- aux évaluations nécessaires au suivi pédagogique, dans le respect des droits définis.

### Réclamations

- Ajouter un formulaire de réclamation dans l'espace apprenant.
- Ajouter un formulaire de réclamation dans l'espace formateur.
- Toute réclamation doit alimenter le tableau de suivi Qualité et créer, si nécessaire, une action de traitement.

### Certificat après formation

Le lendemain de la fin de formation :

- générer automatiquement le certificat attestant la réalisation/présence de l'apprenant ;
- le déposer dans son espace ;
- ne pas générer automatiquement le certificat lorsqu'une absence ou une anomalie de présence empêche d'attester normalement la réalisation ;
- conserver la preuve utilisée pour justifier l'émission du certificat.

## Lot H — Livret d'accueil enrichi

Le livret d'accueil généré pour les apprenants doit comprendre au minimum :

- une présentation de l'organisme et de la formation ;
- l'explication de l'utilisation de l'espace apprenant en ligne ;
- la manière d'accéder aux documents, évaluations, émargements, questionnaires et réclamations ;
- les coordonnées de l'assistance technique Selen, avec l'adresse email Selen prévue à cet effet ;
- les coordonnées du référent pédagogique : formateur et/ou gérant selon l'organisation ;
- les coordonnées du référent handicap : formateur et/ou gérant selon l'organisation définie par le client ;
- la politique handicap ;
- le règlement intérieur.

Les données propres à l'organisme doivent être alimentées depuis Daily et non saisies librement à chaque génération.

## Ordre recommandé d'implémentation

1. Lot A — corrections dashboard et accès.
2. Lot B — générateur complet « Télécharger un dossier apprenant ».
3. Lot E — nettoyage Studio et attribution des dossiers.
4. Lot F — workflow inscription / agent / client / portail apprenant.
5. Lot C — règles d'émargement et preuves asynchrones, intégrées au nouveau workflow.
6. Lot G — déroulement et fin de formation.
7. Lot H — nouveau livret d'accueil.
8. Lot D — suivi Qualité consolidé, en branchant les réclamations, satisfactions et actions d'amélioration produites par les lots précédents.

Cet ordre évite de construire le tableau Qualité ou les automatismes de fin de session sur des événements métier qui seraient ensuite redéfinis.

## À valider avec Lil

Aucun point bloquant dans cette note. Les formulations exactes des aides peuvent être ajustées au fil de la recette tant que les règles métier ci-dessus sont préservées.
