# Selen Daily V1 — Consolidation des décisions de recette du 27 août 2026

Ce document constitue l’index de référence des décisions prises pendant la recette du 27 août 2026. Il complète le cahier des charges Daily existant et les addenda détaillés du même jour. En cas de doute lors du développement, les règles ci-dessous sont considérées comme validées par la recette utilisateur.

## Documents de référence détaillés

- `docs/daily-v1-recette-corrections-20260827.md` : corrections générales, lots A à H, workflow Daily/Studio, générateur, présence, qualité et déroulement des sessions.
- `docs/daily-recette-addendum-20260827-portal-documents-rdv.md` : pièces organisme, documents propres à l’OF diffusables aux apprenants et prochain créneau de rendez-vous.
- `docs/daily-quality-watch-spec-20260827.md` : refonte du suivi Qualité et tableau de veille.
- `docs/daily-recette-complement-rdv-rappels-20260827.md` : préparation du rendez-vous accompagné et préférences de rappels des tâches.

## 1. Paramétrage initial et pièces organisme

- Le NDA ne doit pas être présenté comme « facultatif » : lorsqu’un organisme possède un NDA, il doit le renseigner.
- Les sélecteurs de fichiers doivent être présentés comme de vrais boutons clairement encadrés, et non comme des contrôles peu lisibles.
- Les pièces administratives attendues sont déposées dans le profil de l’organisme et restent modifiables/remplaçables depuis ce profil.
- Les tâches relatives aux pièces manquantes renvoient vers « Mon profil & mon organisme », jamais vers le paramétrage initial une fois celui-ci terminé.
- Le livret d’accueil n’est pas une pièce à fournir par le client. Selen utilise son propre modèle.
- Avis INSEE : à fournir.
- Certificat Qualiopi : à fournir si l’organisme est certifié.
- BPF : à fournir lorsqu’il existe et qu’il est applicable, notamment pas demandé comme document existant lors de la première année de NDA.
- CV du ou des formateurs : à fournir dans le parcours prévu.

## 2. Paramétrage accompagné

- Lors de la réservation, proposer en premier le prochain créneau réellement disponible dans Google Calendar selon les plages autorisées, tout en permettant de choisir une autre date.
- Avant confirmation du rendez-vous, indiquer clairement les documents à préparer : avis INSEE, BPF s’il existe, CV du ou des formateurs, programme de la ou des formations, certificat Qualiopi si l’organisme est certifié.
- Le mail de confirmation doit reprendre cette liste ainsi que les informations du rendez-vous et le lien de visioconférence.

## 3. Préférences de rappels des tâches

Pendant le paramétrage, le client choisit entre :

1. **Rappel immédiat** : un email lorsqu’une nouvelle tâche requiert réellement son attention, sans doublon inutile ;
2. **Récapitulatif quotidien** : un seul email chaque matin à 7 h, heure de Paris, contenant uniquement les tâches encore ouvertes ; aucun email si rien n’est à faire.

La préférence est conservée au niveau de l’organisme et reste modifiable depuis le profil.

## 4. Dashboard Daily

- Ne plus afficher « Paramétrage autonome » comme fonctionnalité courante après le paramétrage.
- Ajouter une déconnexion claire.
- Afficher correctement le nombre réel de formateurs.
- Les documents manquants doivent générer des tâches utiles et directement actionnables.
- Remplacer « Modèles de documents » par **« Télécharger un dossier apprenant »** dans le dashboard actif.
- L’entrée « Télécharger un dossier apprenant » doit conduire au générateur de dossier, pas à l’ancien gestionnaire de modèles.

## 5. Apprenants

- Le bloc de création d’un nouvel apprenant est replié/masqué par défaut.
- Le bouton **« Ajouter l’apprenant »** doit fonctionner réellement et être visuellement encadré/identifiable comme action principale.
- Le dossier apprenant devient le point d’entrée vers son portail et ses éléments de formation.
- Les administrateurs autorisés et les formateurs affectés à la session doivent pouvoir ouvrir l’espace apprenant depuis le dossier lorsque cet espace est activé, dans le respect de leurs droits.

## 6. Formateurs

- « Mes Formateurs » doit afficher les formateurs réellement enregistrés et les compter correctement.
- Il doit être possible d’ajouter un nouveau formateur directement depuis « Mes Formateurs ».
- Le formulaire d’ajout est masqué/replié par défaut et s’ouvre à la demande.
- Le formateur ajouté est créé comme véritable profil formateur de l’organisme.
- Les informations formateur saisies lors du paramétrage doivent alimenter ce même référentiel et ne pas disparaître entre l’ancien stockage d’onboarding et les profils organisationnels.

## 7. Formations, sessions et évaluations

- La création d’une nouvelle formation est présentée dans un bloc replié au-dessus des formations existantes.
- Une formation peut avoir plusieurs sessions ; la création d’une session n’est pas intégrée au formulaire de formation.
- La création d’une session est facultative au moment du paramétrage initial.
- Les sessions distinguent présentiel, distanciel et mixte ; le distanciel distingue synchrone et asynchrone lorsque nécessaire.
- L’évaluation finale doit pouvoir être configurée sur le même principe que le positionnement : questionnaire Selen ou preuve/questionnaire externe selon le parcours retenu.
- Les preuves de positionnement et d’évaluation finale doivent être reliées à l’apprenant, la session et la formation afin d’être exploitables dans Audit Live.
- Les sessions doivent être regroupées en vue claire avec création repliée, sessions planifiées/terminées et progression du dossier.

## 8. Inscription et workflow client/agent

- Un seul lien public d’inscription par formation.
- Pour les sessions synchrones, présentielles ou mixtes futures, le candidat choisit une session disponible.
- Pour le distanciel asynchrone, pas de choix de session lorsque le parcours ne l’exige pas ; l’accès est géré selon le workflow prévu.
- Lorsqu’aucune date n’est encore attribuée, la demande reste à rattacher et doit créer une action utile, sans multiplication de notifications.
- Création formation : une tâche agent de vérification/validation.
- Création session : pas de notification agent, seulement apparition dans le planning.
- Dossier d’inscription reçu : tâche agent regroupée au niveau du dossier.
- Les tâches doivent être séquentielles et apparaître uniquement lorsque l’acteur concerné a réellement quelque chose à faire.
- Après validation client/agent selon l’étape, l’espace apprenant est activé et les accès transmis selon le workflow défini.

## 9. Générateur de dossier apprenant

- Le dashboard doit utiliser **« Télécharger un dossier apprenant »**.
- Le générateur doit reprendre le principe et le contenu du générateur de dossiers Studio, adapté à Daily.
- Choix/création formation, choix/création session, sélection/renseignement apprenant, entreprise/commanditaire et financeur si nécessaire.
- Identité de l’organisme verrouillée sur l’organisme Daily connecté.
- Production du dossier en PDF uniquement.
- Possibilité d’importer ultérieurement une version PDF manuelle d’un document sans perdre l’historique.
- Les modèles Word Selen peuvent rester disponibles pour usage hors ligne lorsqu’ils sont utiles, mais ne constituent plus l’entrée principale du dashboard.

## 10. Documents propres à l’organisme dans les espaces apprenants

Créer une bibliothèque distincte permettant à l’OF de déposer ses documents ou informations propres à destination des apprenants avec trois modes de diffusion :

1. automatique pour tous les espaces apprenants de l’organisme, y compris les futurs ;
2. pour tous les apprenants d’une session ;
3. pour une sélection d’apprenants d’une session.

Ces contenus doivent être clairement identifiés comme provenant de l’organisme et rester distincts des documents générés/fournis par Selen.

## 11. Présence et fin de formation

- Présentiel, mixte et distanciel synchrone : feuilles d’émargement/signatures adaptées au parcours.
- Distanciel asynchrone : preuve de réalisation par capture ou justificatif de temps de connexion à la place d’une feuille d’émargement classique.
- Les preuves sont reliées à l’apprenant, la session et la formation.
- Le dernier jour, rendre disponibles l’évaluation finale et la satisfaction et envoyer les rappels prévus.
- Les formateurs disposent des accès nécessaires aux éléments de présence et d’évaluation de leurs sessions.
- Les réclamations apprenant/formateur alimentent le suivi Qualité.
- Les attestations/certificats ne doivent être générés ou déposés qu’après vérification des éléments de présence/réalisation nécessaires.

## 12. Suivi Qualité

Le module devient un véritable espace de pilotage comprenant notamment :

- procédures de gestion documentaire ;
- prévention des absences/abandons ;
- gestion des abandons ;
- fiches de poste ;
- politique handicap ;
- ressources MDPH, AGEFIPH, Ressource Handicap Formation et Cap emploi adaptées aux régions ;
- satisfactions apprenants, formateurs, entreprises/commanditaires ;
- incidents, difficultés et réclamations ;
- solutions/actions correctives ;
- améliorations mises en œuvre ;
- historique daté et auteurs des interventions Studio.

Pour les organismes Qualiopi, le suivi est obligatoire ; pour les autres, il peut être désactivé.

## 13. Tableau de veille Qualité

Trois familles :

- veille réglementaire formation professionnelle ;
- veille pédagogique et technologique ;
- veille métier.

Les deux premières sont alimentées par Selen à partir des articles du blog. Chaque ligne commune comporte au minimum le titre, le lien, le type et la date.

Chaque organisme peut cocher **« Ça m’intéresse »**, conserver la date du choix et indiquer l’amélioration qui en découle.

La veille métier est propre à l’organisme et doit pouvoir être saisie manuellement.

Une tâche **« Compléter ma veille métier »** apparaît une fois par mois et est clôturée pour le mois lorsqu’une entrée métier est créée/validée.

Studio peut, pour une veille commune ayant entraîné une amélioration Selen généralisée, forcer « Ça m’intéresse », inscrire l’amélioration réalisée, appliquer l’action à tous les clients ou à une sélection et conserver l’auteur/date/origine Studio.

## 14. Studio

- Retirer du dashboard les cartes « Remboursements à traiter » et « Messages ».
- Les remboursements sont gérés comme type/motif de dossier Support avec statut et historique.
- Permettre l’attribution et la réattribution d’un dossier Daily à un agent avec historique.
- Les tâches Daily sont routées prioritairement vers l’agent attribué.
- Un dossier de session Daily doit regrouper les actions relatives à une même session au lieu de générer une multitude de notifications.
- Studio doit pouvoir consulter et compléter le suivi Qualité et les veilles des clients selon les droits autorisés.

## 15. Principe de validation technique

Une correction n’est considérée terminée que si les éléments applicables sont vérifiés :

1. composant/route réellement utilisé ;
2. code présent sur `main` ;
3. migration appliquée lorsqu’elle est nécessaire ;
4. déploiement Vercel production correspondant créé ;
5. état `READY` ;
6. comportement réel vérifié autant que possible.

Un commit GitHub seul ne signifie jamais « en production ».
