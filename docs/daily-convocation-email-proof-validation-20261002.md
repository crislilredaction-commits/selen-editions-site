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

## Correction bornée avant fusion : projection des DTO clients

Base de cette intervention : branche `fix/daily-convocation-email-proof-20261002`, HEAD local vérifié `57114eace7155ab84781a7c2cd2d3d8389379031`, arbre initial propre. Main réel communiqué par Work : `4a04bdac7ef3b3a0240dc15d7b42bbabc52da2db`. Work rapporte 773 tests verts, un build externe réussi et une relecture des six fichiers avec 215 tests ciblés indépendants ; ces résultats externes ne sont pas revendiqués comme exécutés par cette intervention.

Constat Work accepté : les GET `communications` et `session-dossiers` sérialisaient intégralement `metadata.email_input`, y compris `attachmentBase64` et `prepared`. Avec le vrai contexte d’organisation et les capacités `trainings:true / sessions:false`, le dossier retournait HTTP 200 avec les octets privés alors que le téléchargement retournait HTTP 403. Le script temporaire externe n’a pas été recherché ; le cas utile est reproduit dans les tests du dépôt.

Le helper pur partagé `lib/daily/communicationMetadata.ts` retire uniquement la propriété de premier niveau `email_input` lorsque `communication_type === "convocation"`, pour les circuits canonique et legacy et indépendamment du statut. Les deux GET l’appliquent au dernier moment, dans leur DTO. La déstructuration produit un nouvel objet sans mutation de la ligne, de metadata ou du snapshot. Les autres familles restent inchangées. Une metadata absente reste absente dans le JSON ; null, tableaux et scalaires conservent leur valeur, sans objet de remplacement inventé.

Les métadonnées métier (version, fichier, SHA, références et tentative), les champs existants de chaque SELECT (notamment subject, text_body et provider_message_id dans Communications), statuts, horodatages, documents liés et canonicalStates sont conservés. Aucun SELECT, filtre, garde ou droit n’a changé. Le dossier continue de respecter son contrat existant : aucun champ supplémentaire de Communications ne lui a été ajouté.

Le snapshot complet reste en base pour les reprises. Les quatre modules de preuve/d’envoi #28, clés, CAS, historiques pending, reprises bornées et statuts confirmés ne sont pas modifiés. Aucun changement du PDF de preuve, de Studio, d’Auth/organisation, de téléchargement, de politique de conservation, de SQL ou de migration.

### Validation de la projection

`tests/dailyCommunicationMetadata.test.mjs` ajoute 22 tests comportementaux. La VM transpile et exécute les deux vraies routes, le vrai helper de projection, le vrai `dailyOrganisationContext` et la vraie route de téléchargement pour son refus. Une liste fermée interdit tout import de SDK réseau/Auth ; workspace, assistance et admin sont des doubles stricts. Les opérations DB disponibles sont exclusivement de lecture ; les métadonnées retournées conservent la référence gelée de la fixture DB. Les réponses passent par une véritable sérialisation JSON (`Response.json`).

Couverture : convocations canoniques et legacy queued/sent/pending ; absence d’email_input, attachmentBase64 et de sentinelle privée dans le JSON ; conservation exacte des autres metadata et des champs existants ; autres familles intactes ; DB et snapshot inchangés après GET ; contexte trainings seul autorisé au dossier mais refusé au téléchargement et à Communications ; refus du workspace et des capacités avant toute requête ; périmètres OF/session et exclusion des communications/liens étrangers ; documents liés et canonicalStates ; metadata absentes/null/tableaux/scalaires. Le helper est aussi exécuté directement avec contrôles d’identité et de non-mutation.

Commandes exécutées avec le même PATH Node v24.20.0 que ci-dessus, avec codes de retour observés séparément :

| Commande | Retour | Résultat |
| --- | --- | --- |
| `node tests/dailyCommunicationMetadata.test.mjs` | 0 | 22 tests réussis, aucun ignoré |
| `node tests/dailyConvocationEmailProof.test.mjs` | 0 | 93 tests #28 réussis, aucun ignoré |
| `node --test tests/dailyCommunicationMetadata.test.mjs tests/dailyConvocationEmailProof.test.mjs tests/dailyAbandonedDocumentSends.test.mjs tests/dailySessionDossierWorkspace.test.mjs tests/dailySessionFollowupProvenance.test.mjs tests/dailySignatureFollowupVisibility.test.mjs tests/dailySignatureSendEvidence.test.mjs tests/dailyPretrainingA10.test.mjs` | 0 | 8 fichiers verts |
| `npm test` | 0 | 84 fichiers verts, aucun échec ni fichier ignoré |

## Reprise Work après interruption de Codex

Le 2 octobre 2026, Work a relu le cahier maître Selen actuel et vérifié GitHub : main est `4a04bdac7ef3b3a0240dc15d7b42bbabc52da2db`, la branche cible reste `57114eace7155ab84781a7c2cd2d3d8389379031`, aucune PR de ce lot n'est ouverte. La mission #29 (`36995646603`, job `110801627670`) a échoué le 2 octobre à 10:35 UTC sur « You've hit your usage limit », avant la validation externe et le commit/push. Ce résultat ne constitue pas une livraison ; le build lancé dans la session Codex n'a pas de résultat final confirmé.

Récupération bornée du travail déjà produit, sans nouvel appel Codex ni modification du workflow Lenovo : patch de l'artifact `11221647320` (SHA256 du ZIP `c6605446e5742a45893749ddee8dd515c60cd8da7c4253bb8c9ed645d4e3bf04`), helper et tests créés par Codex récupérés depuis les commandes et sorties complètes des logs du même job. Le patch ne contenait pas ces deux fichiers encore non suivis : ils ont été récupérés explicitement. Aucun script de shell provenant du journal n'a été exécuté ; seules les sources récupérées ont été relues puis testées.

Contrôle Work indépendant sur une copie détachée de la branche cible avec Node v24.19.0 et dépendances locales réutilisées : `node --test` sur dailyCommunicationMetadata, dailyConvocationEmailProof, dailyAbandonedDocumentSends, dailySessionDossierWorkspace, dailySessionFollowupProvenance, dailySignatureFollowupVisibility, dailySignatureSendEvidence, dailyPretrainingA10, dailyPretrainingRetirement, dailyAcceptanceEmail et dailyEnterpriseEmailDelivery : 270 tests réussis, 0 échec, 0 ignoré. Cela inclut les 22 cas de confidentialité et les 93 cas de preuve de convocation. Les fixtures interdisent réseau, SDK Auth et mutations DB pour les GET ; les envois des autres cas sont des doubles, aucun email réel n'a été envoyé.

`git diff --check` est vert. Les quatre modules d'envoi/preuve de #28, les tests existants, les autorisations, les filtres et le schéma restent identiques à `57114ea`. Cette récupération ne vaut pas validation du typecheck/build avec ces dépendances réutilisées, ni publication en production. Work publie le résultat récupéré sur la même branche `fix/**` pour que le workflow existant Selen local check exécute séparément la suite complète, le typecheck et le build. Fusion seulement après ces résultats, contrôles GitHub et preview Vercel verts sur le SHA final ; contrôle de main et production après fusion.
