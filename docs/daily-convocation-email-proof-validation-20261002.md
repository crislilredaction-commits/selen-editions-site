# Preuve d’envoi des convocations Avant — 2026-10-02

## Base et périmètre

Branche locale : `fix/daily-convocation-email-proof-20261002`.
HEAD initial vérifié : `4a04bdac7ef3b3a0240dc15d7b42bbabc52da2db` (base demandée, fusion #291). Arbre initial propre. Aucune ancienne branche reprise. La référence locale `main` est absente ; aucune vérification distante de main/CI/production n’est revendiquée. Work conserve cette vérification avant publication.

Modifications limitées aux trois fichiers autorisés, au helper serveur `dailyConvocationEmailProof.ts`, au nouveau test `dailyConvocationEmailProof.test.mjs` et à cette trace. Aucun changement Auth/RLS, signature, token, publication, droits, migration, infrastructure, UI ou autres familles email. Aucun ancien test modifié. Aucun commit, push, PR, déploiement ou appel de production effectué.

## Cause et correction

Les circuits acceptaient une réponse Resend sans ID et considéraient un UPDATE sans erreur comme une preuve de modification. Le pack legacy n’avait pas de réservation dans `daily_communications`.

Le helper commun calcule une PK UUID déterministe, dans un namespace propre aux convocations, à partir de la source réelle (`daily_documents` / `daily_convocations`), de l’ID du document, de la version, du destinataire choisi et du périmètre OF/session. Les algorithmes des emails apprenant/entreprise/acceptation restent intacts. L’INSERT unique réserve l’opération ; une concurrence perdante n’appelle pas Resend. La clé Resend est `daily-convocation/<uuid>`.

La réservation conserve dans metadata les octets base64 de l’attachement, son nom, le contenu préparé (objet/texte/HTML/expéditeur), les paramètres du destinataire et la version/fichier/bucket exacts. Les reprises utilisent cet instantané et ne téléchargent pas une nouvelle pièce jointe. Pour le circuit canonique, `daily_communication_documents` est écrit sans remplacer un lien existant, puis relu et comparé champ par champ avant le fournisseur. Le pack legacy conserve sa référence convocation/version/fichier dans metadata, sans créer de FK vers `daily_documents`.

Une confirmation exige un ID fournisseur chaîne non blanche et une date valide, une finalisation retournant effectivement une ligne, puis une relecture de cette communication dans son périmètre. Les dates PostgreSQL `+00:00` et ISO `Z` sont comparées comme des instants. Les statuts prouvés `sent`, `delivered`, `bounced` attestent l’acceptation fournisseur ; ils ne promettent pas la livraison au destinataire.

Transport jeté, erreur fournisseur ambiguë, ID absent/invalide, finalisation erreur/jetée/zéro ligne : `pending`, sans passage en `failed` d’une tentative potentiellement acceptée. `queued` est une barrière persistante, sans délai d’expiration ni reprise automatique, y compris après 49 heures dans les tests. Si l’écriture a réussi mais sa relecture échoue, la requête reste pending ; une relecture ultérieure peut retrouver la preuve sans nouvel email.

Seul un échec certain avant fournisseur (ex. snapshot ou clé API absente) ou un rejet fournisseur `validation_error` ouvre une reprise. Le CAS compare statut, date d’échec, numéro de tentative et marqueur de reprise sûre. Maximum : deux réservations actives successives pour la même opération (initiale + une reprise). Les autres erreurs restent ambiguës. Un téléchargement échoué avant création d’un instantané ne crée aucune tentative fournisseur ; un prochain appel peut recommencer cette préparation. Une erreur de réservation empêche toujours l’appel fournisseur.

API manuelle : HTTP 200 avec `sent` / `already_sent` et preuve relue ; HTTP 202 avec `pending`, `evidenceRecorded:false`, sans `sentAt` / `sentTo` ; HTTP 503 avec `rejected` pour l’échec certain. Le pack retourne `pending` tant que la communication ou sa projection sur la convocation n’est pas confirmée. Une preuve durable permet de synchroniser une convocation encore `generated`, sans rappeler le fournisseur ; un UPDATE zéro ligne n’est pas une finalisation complète.

## Historiques et limites exactes

Les communications historiques incomplètes, les snapshots incohérents et les convocations `sent` / `viewed` / avec `sent_at` sans communication fournisseur prouvée restent incertains, sans réémission ni fabrication rétroactive de preuve. Un historique complet et rattaché à la version exacte est réutilisé. Un historique dont la version manque ne donne pas autorisation d’envoyer.

Les lignes queued ne sont jamais récupérées automatiquement, même après un arrêt du processus entre réservation et fournisseur. Une enquête externe reste nécessaire pour ces pending ; cette mission n’ajoute ni outil de résolution, ni bouton, ni notification. Les octets d’attachement sont conservés dans metadata pour garantir la stabilité des reprises, ce qui augmente la taille de cette preuve. Aucune politique de rétention n’est modifiée.

Le choix du document, du destinataire et de l’attachement de chaque circuit est préservé. Les gardes de la route manuelle restent avant stockage/réservation/fournisseur. Le pack vérifie toujours toutes les signatures et les inscriptions inactives ; la session archivée ou sans périmètre OF exploitable bloque également avant stockage. Aucun contournement des autres blocages privés n’est introduit.

## Tests et commandes locales

Les nouveaux tests transpilent et exécutent les quatre vrais modules TypeScript dans une VM à liste d’imports fermée. Resend, stockage, DB, horloge et contexte d’organisation sont des doubles ; les SDK réseau et Auth réels sont interdits. Les doubles vérifient les tables/mutations autorisées, la PK unique, le CAS, la vraie FK canonique, la réservation avant fournisseur et la clé d’idempotence.

93 scénarios comportementaux : les quatre reproductions initiales, succès prouvé, ID absent/blanc/non-chaîne, rejet définitif/ambigu/transport, claims et snapshots erreur/jetés/zéro ligne, finalisations erreur/jetées/zéro ligne, relecture incertaine à +49h, concurrence, reprise bornée et contenu original, isolation source/document/version/destinataire/OF/session, historiques complets/incomplets, synchronisation pack sans doublon, gardes manuels et signatures/inscriptions/session du pack, dates PostgreSQL équivalentes. Le test existant `dailyAbandonedDocumentSends` reste inchangé, notamment son assertion sur le vrai appel à `sendDailyConvocation({` après le garde inscription.

Runtime utilisé : `/home/LilBarthaux/.nvm/versions/node/v24.20.0/bin`, ajouté au PATH des commandes. Le premier essai `npm run typecheck` sans ce PATH a réellement retourné **127** (`npm: command not found`). Les commandes suivantes ont été exécutées séparément, sans masquer leur code de retour :

| Commande | Retour | Résultat |
| --- | --- | --- |
| `node --test tests/dailyConvocationEmailProof.test.mjs tests/dailyAbandonedDocumentSends.test.mjs` | 0 | Deux fichiers verts |
| `node tests/dailyConvocationEmailProof.test.mjs` | 0 | 93 tests, 93 réussis |
| `npm test` | 0 | 83 fichiers, aucun échec |
| `npm run typecheck` | 0 | TypeScript sans erreur |
| `npm run build` | 1 | Gardes pré-build verts ; échec réseau Google Fonts |
| `git diff --check` | 0 | Aucun défaut d’espacement |

Le build Next.js/Turbopack réel échoue lors des requêtes `fonts.googleapis.com` pour **Cinzel**, **EB Garamond** et **Playfair Display** (`Failed to fetch ... from Google Fonts`). Aucune police remplacée, aucun mock de build, aucun contournement réseau. Le build de production complet ne peut donc pas être déclaré validé ici.

Logs locaux : `/tmp/convocation-targeted-final.log`, `/tmp/convocation-behavior-details.log`, `/tmp/convocation-npm-test-final.log`, `/tmp/convocation-typecheck-final.log`, `/tmp/convocation-build.log`. Ils ne sont pas versionnés.

Après le commit/push assuré par le workflow externe, Selen local check puis les vérifications Work/GitHub/Vercel restent nécessaires. La validation locale ne vaut pas validation CI ou production.
