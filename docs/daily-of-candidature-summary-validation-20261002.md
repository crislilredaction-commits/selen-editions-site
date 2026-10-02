# Synthèse Selen de candidature côté OF — validation du 2 octobre 2026

## Base et constat

Branche `fix/daily-of-candidature-summary-20261002`, arbre initial propre, HEAD local `07b875f8baaf0bde699f6236bd2a1f75437debc4`. Avant modification, le connecteur GitHub a résolu **main et la branche cible** sur ce même SHA, commit de la PR #290. La commande `git ls-remote origin refs/heads/main refs/heads/fix/daily-of-candidature-summary-20261002` a échoué avec `Could not resolve host: github.com` ; la vérification distante repose sur le connecteur, pas sur une référence mémorisée.

Lecture ciblée de la vraie page : les cartes `ready_for_of` proposaient Accepter/Refuser sans synthèse, et l’historique convertissait en chaîne seulement `observations` ou `motivation_summary`. Le diagnostic Work n’a pas été recherché sur cette machine. Ses cas utiles sont reproduits dans les nouveaux tests de la vraie page compilée TypeScript et exécutée en VM. Aucun nouvel audit des API ou autorisations.

## Correction limitée à Avant

- La page affiche les sept rubriques dans l’ordre motivation, attentes, positionnement, besoins, adaptations, prérequis, observations, avant les actions de décision et intégralement dans l’historique accepté/refusé. Les décisions, commentaires, sessions, matérialisations et bouton de vérification email existants restent en place. Les dossiers pending restent hors des cartes à décider.
- `lib/daily/candidatureSummary.ts` projette explicitement les sept champs autorisés du DTO chargé. Seules les chaînes non blanches sont du contenu ; les valeurs manquantes ou malformées restent « Non renseigné ». Aucune rubrique valide signifie « Synthèse indisponible », sans bouton PDF. Les dates invalides ou absentes sont signalées, sans inventer date, auteur ou validation. Les textes restent complets, avec retours à la ligne et coupure des mots longs en UI ; React les affiche comme texte.
- `lib/daily/candidatureSummaryPdf.ts` utilise jsPDF existant, chargé à la demande. Renderer pur : titre, candidat, formation, dates et état disponibles, puis les mêmes sept valeurs projetées. Chaque ligne est paginée individuellement dans les marges. Aucun appel réseau, module serveur, stockage, route, token ou SDK privé.
- L’action crée un Blob PDF et une URL d’objet, déclenche le téléchargement avec un nom nettoyé, retire l’ancre et révoque l’URL après un délai de consommation navigateur. Chargement et erreurs sont propres à chaque carte, avec nouvelle tentative possible. Aucun déclenchement de décision, inscription ou email par l’export.

API, autorisations, Auth, RLS, SQL, périmètres et guards inchangés. Aucun changement du choix individual/company, du nom commanditaire ou des règles de matérialisation. Renderers et corrections des programmes #278/#290, emails #287, sessions #288 et preuve entreprise #289 conservés. Aucun fichier de test existant modifié. Aucun commit, push, PR, migration ni mission déclenché.

## Tests exécutés

Nouveau fichier `tests/dailyOfCandidatureSummary.test.mjs`, **19 cas** :

- Vraie page ready_for_of, accepted et refused, sept sentinelles distinctes et valeurs complètes ; ordre avant décision, commentaires et historique préservés ; sessions, inscriptions matérialisées et vérification email conservées.
- Pending sans carte décision/export ; synthèse absente, null, chaîne inattendue, tableau, objet vide, valeurs blanches/nombres/objets ; dates invalides, métadonnées malformées ; absence de faux contenu et de `[object Object]`.
- Synthèse partielle : six rubriques honnêtement non renseignées ; balises HTML conservées en texte, sans interprétation.
- Action réelle de téléchargement sur deux cartes : bon candidat, Blob PDF réel, nom sûr, ancre attachée et révocation ; rechargement du GET de fixture et export de la nouvelle synthèse, sans ancienne capture.
- Erreurs renderer, Blob, création d’URL et clic de téléchargement : message visible, bouton réactivé, nouvelle tentative réussie, statut de décision inchangé et URLs créées révoquées.
- jsPDF réel instrumenté : plus de trois pages, 400 longs paragraphes, accents français, CRLF et lignes vides, dernière rubrique et dernier paragraphe ; égalité exacte entre toutes les lignes calculées et dessinées, une seule émission, limites horizontales et verticales respectées.
- Sentinelles privées/inconnues, evaluator_email et objet participant exclus de l’UI et du PDF. Imports strictement autorisés, aucun repli vers SDK réel ; seul le GET de fixture est permis à la page, tous les POST et accès réseau interdits. Aucun email ni dossier réel.

## Résultats dans ce bac

Node fourni par `/home/LilBarthaux/.nvm/versions/node/v24.20.0/bin`, ajouté au PATH ; aucune dépendance installée.

- Tests ciblés : `node --test --test-isolation=none tests/dailyOfCandidatureSummary.test.mjs` : **19/19 réussis**, code 0.
- `npm test` : **82 fichiers réussis**, aucun échec, code 0. Ce rapport isolé compte les fichiers, pas les cas individuels. Tous les tests existants sont conservés.
- `npm run typecheck` : succès, code 0.
- `npm run build` : tous les garde-fous préalables réussissent, puis **échec, code 1**, de Next.js 16.1.6 / Turbopack. Trois erreurs `Failed to fetch` pour **Cinzel**, **EB Garamond**, **Playfair Display** depuis Google Fonts, avec erreur de connexion à `fonts.googleapis.com`. Le build canonique complet reste non validé dans ce bac. Aucun changement de police, mock, build simulé ou contournement de configuration.
- `git diff --check` : succès, code 0 après le build et après finalisation de cette trace.

Journaux locaux : `/tmp/of-summary-targeted.log`, `/tmp/of-summary-npm-test.log`, `/tmp/of-summary-typecheck.log`, `/tmp/of-summary-build.log`.

## Limites

Le PDF est uniquement la **synthèse de candidature** autorisée et déjà chargée. Il ne contient pas le dossier original complet, les réponses originales ni tous leurs justificatifs. Aucun droit supplémentaire, publication ou partage de fichier n’est accordé. La synthèse ne constitue pas une preuve de signature ou de satisfaction des prérequis.

Les tests de page utilisent une VM avec hooks React et DOM de téléchargement stricts, pas un navigateur graphique. Ils exercent le vrai code de page et le renderer jsPDF réel. La police standard Helvetica couvre les accents français testés ; une couverture universelle des écritures Unicode n’est pas revendiquée.

Validation réelle ultérieure **Selen local check et Vercel obligatoire sur le futur commit**. Le check #58 et la production READY cités par Work concernent la base, pas cette modification. Cette correction ne livre pas le parcours Avant complet et ne débloque pas les autres dossiers privés ni #25. Pendant/Après restent hors périmètre.
