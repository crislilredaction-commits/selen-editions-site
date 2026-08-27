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

## À valider avec Lil

Aucun point bloquant dans cette note. Les formulations exactes des aides peuvent être ajustées au fil de la recette tant que les règles métier ci-dessus sont préservées.
