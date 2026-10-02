# Programme public dans l’espace apprenant — validation du 2 octobre 2026

## État vérifié et écart observé

Branche de travail : `fix/daily-learner-program-access-20261001`. Arbre initial propre ; HEAD local : `3f823e1856720df2a0e46180667b3eff0b0691ab`. Le connecteur GitHub a vérifié la branche cible et résolu cette branche ainsi que `main` au même SHA (commit #289). `git ls-remote` a échoué : `Could not resolve host: github.com` ; la vérification distante a donc utilisé le connecteur, pas les seules références locales.

Le GET du portail exposait les documents existants mais aucun lien vers le programme public structuré déjà livré par #278. Les composants attendaient conjointement le portail et les ressources privées : un rejet réseau de ces dernières empêchait aussi l’affichage du portail.

## Correction bornée

- `app/api/daily-portal/[token]/route.ts` : ajout facultatif de `publicProgramPdfUrl`, exclusivement pour l’apprenant après les contrôles existants de token, session et inscription active. Lecture séparée de six champs : `id,organisation_id,status,creation_mode,public_registration_enabled,public_registration_token`. Filtres et vérification des identifiants exacts de formation et d’OF de la session. Conditions : validated, création Selen ou historique null/absente, publication strictement true et vrai token non vide. URL relative encodée vers la route existante `program-pdf`. Aucun repli. Erreur de lecture : réponse 500 explicite. Aucun nouvel objet formation exposé ; `session.daily_formations` conserve son DTO.
- `components/daily/LearnerPhaseNavigation.tsx` : lien visible dans Avant pour l’apprenant, hors du bloc replié des documents privés.
- `components/daily/DailyStakeholderWorkspace.tsx` : même lien dans Mes documents avant formation, sans message de liste vide si le programme est disponible. Les deux composants tolèrent le rejet réseau de `/resources` pour afficher les données du portail. Leurs listes et liens privés existants sont conservés.
- `tests/dailyLearnerProgramAccess.test.mjs` : exécution du vrai GET avec SDK mémoire à tables/méthodes limitées, sélection publique exacte et mutations existantes contrôlées ; vrais composants exécutés avec hooks et fetch de fixture ; suivi de l’URL vers la vraie route PDF et jsPDF réel. Aucun import implicite de SDK réseau, Auth ou email.

Pas de modification de l’email d’acceptation, de ses messages, de l’origine ou des clés d’idempotence. Les critères publics reprennent ceux de `dailyAcceptanceEmail.ts`, sans extraction ni adaptation de ses tests. Aucun changement au renderer, aux routes privées, aux types de documents autorisés, à Auth, aux droits, aux jetons, à SQL, aux workflows ou aux données de production. Aucun commit, push, PR, migration ou autre mission déclenché.

## Couverture comportementale

- GET positif Selen validated/public, session et OF exacts, inscription active ; modes historique null et absent ; encodage de `/+?é%#` dans le vrai token public.
- Absence de lien : mauvais OF/id, relation absente, formation draft/review/archived, import, publication désactivée, token vide/null/blanc, formation ou OF manquant dans la session.
- Token revoked/expired, expiration temporelle, session archivée, inscription declined/cancelled/abandoned : refus avant toute lecture publique. Mutations historiques viewed/revoked/expired conservées. Aucune lecture de formation publique pour enterprise/trainer.
- Sélection des seuls six champs, préservation du DTO formation, absence des flags publics et du token de portail dans le résultat ajouté ; erreur de lecture explicite.
- Chaque composant : ressources privées vides, erreur HTTP et rejet réseau ; lien ouvrable en nouvel onglet, absence si indisponible ou entreprise, conservation du programme privé et du document publié. La convocation reste annoncée indisponible ; le programme ne crée ni contrat ni signature. Pas d’ajout dans les onglets Pendant/Après.
- Suivi du lien GET jusqu’au PDF réel : objectifs, contenu long, dernière ligne et dernier paragraphe présents, plus de trois pages. Tests #278 de pagination conservés intégralement, dont égalité des lignes attendues/dessinées et respect des marges.

## Résultats locaux

Node disponible via `/home/LilBarthaux/.nvm/versions/node/v24.20.0/bin` ajouté au PATH ; dépendances déjà présentes. Premier appel sans ce PATH : `node: command not found`, résolu sans installation.

- Tests ciblés : **152/152**, aucun échec, avec `node --test --test-isolation=none` sur les sept fichiers learner-program-access, programme-PDF, acceptance-email, learner-shared-documents, learner-portal-access, enterprise-portal-access et learner-space.
- `npm test` : succès, **81 fichiers** réussis, aucun échec (le rapport isolé de ce bac compte les fichiers, pas les cas individuels).
- `npm run typecheck` : succès, code 0.
- `npm run build` : garde-fous préalables tous réussis ; échec Next.js 16.1.6 / Turbopack, code 1. Trois erreurs `Failed to fetch` depuis Google Fonts : **Cinzel**, **EB Garamond**, **Playfair Display**, avec erreur de connexion à `fonts.googleapis.com`. Le build canonique complet n’est donc pas validé dans ce bac. Aucun remplacement de police, mock de build ou changement de configuration.
- `git diff --check` : succès, code 0 après le build et après finalisation de cette trace.
- Journaux locaux : `/tmp/learner-program-targeted.log`, `/tmp/learner-program-npm-test.log`, `/tmp/learner-program-typecheck.log`, `/tmp/learner-program-build.log`.

## Limites

Les programmes importés, privés ou non publiés restent hors de cette disponibilité publique. Aucun nouveau droit de fichier n’est accordé. La présence du programme ne vaut pas publication, envoi ou signature du contrat, convention, convocation, livret ou règlement. Les erreurs de lecture internes au GET conservent leur comportement bloquant existant ; la tolérance UI concerne la requête séparée `/resources`.

Cette livraison ne termine pas Avant globalement et ne reprend pas la mission publique individual/company #25. Le Selen local check sur le futur commit réel et la validation Vercel restent nécessaires ; aucune exécution sur l’ancien HEAD ne vaut validation de ce worktree non commité.
