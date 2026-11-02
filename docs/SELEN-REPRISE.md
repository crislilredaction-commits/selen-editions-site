# SELEN — Reprise opérationnelle partagée

> Statut initial : À AUDITER. Ce document n'atteste aucune recette. Référence métier : [cahier maître](https://docs.google.com/document/d/1W2cO_X7X_E3rOT6qxKy9_Oq2635tJveHqLmYJn9HrW0/edit).
> Source commune aux dépôts `selen-editions-site` (Daily) et `selen-studio` (Studio). Ne pas créer de copie divergente dans Studio.

## Règle de reprise (obligatoire)
1. Lire ce fichier **sur la branche principale actuelle**, le cahier maître, les derniers commits et PR des DEUX dépôts. Vérifier l'état réel, ne jamais supposer qu'une ancienne note est encore exacte.
2. Reprendre le chantier actif et sa **prochaine action unique**. Ne changer de chantier que s'il est TERMINÉ, bloqué par une action humaine, ou supplanté par un incident P0 démontré. Le contrôle Work ne réattribue pas arbitrairement le chantier.
3. Avant modification, vérifier HEAD et PR en cours; ne pas écraser une modification concurrente. Écrire via branche/PR et protections normales, jamais en contournant CI.
4. En fin d'exécution, actualiser ici le résultat, la preuve (PR/SHA/test), le blocage et la prochaine action **exécutable**. Relire le fichier écrit. Si écriture impossible, le signaler comme blocage de continuité et fournir le texte exact à reprendre; ne pas prétendre la passation sauvegardée.
5. Ne jamais déclarer TERMINÉ sur la seule base de tests verts, fusion ou Vercel READY : une recette bout-en-bout authentifiée et des critères d'acceptation prouvés sont nécessaires. Sans comptes de test : À RECETTER.
6. Aucune modification de données réelles, signature pour autrui, email réel, migration risquée ou désactivation de protections.

## Chantier actif
- Identifiant : **SELEN-P0-CANDIDATURE** (P0-01).
- Parcours : candidature publique → analyse agent Studio → décision OF ou délégation identifiée → inscription et liens ponctuels.
- **État : À RECETTER**, et non TERMINÉ. Tests automatisés réussis, aucune recette authentifiée complète.
- Références revérifiées : Daily main `f2db26ab336d27a6ac3f7870ac23f4ee967383a4` (PR [#492](https://github.com/crislilredaction-commits/selen-editions-site/pull/492) fusionnée) ; Studio main `a7e94a5784b5c666dbd121cd936e0000b48a6ae5` (#448 tâches manuelles déjà fusionnée).
- **Maillon corrigé** : la page Daily choisissait automatiquement la première session disponible lorsqu'aucune session n'était attachée. Elle exige désormais une sélection explicite et compatible, ne conserve que les choix encore valides et exclut les sessions archivées/annulées. Le choix historique garde sa double confirmation. Les sélecteurs ont un nom accessible.
- Preuves : HEAD PR #492 `db56e63ef09c120687ccf5a7591d6af51bcdc31c` ; GitHub Automated Tests SUCCESS (2243/2243) ; Selen local check SUCCESS (tests, ESLint ciblé, TypeScript, build) ; Preview Vercel `dpl_Agi6aGRGa33W54rGCB9agQYpHJmK` READY sur HEAD exacte ; fusion squash Daily main `f2db26ab336d27a6ac3f7870ac23f4ee967383a4` ; CI post-fusion Automated Tests et Selen local check SUCCESS sur SHA main ; production Vercel `dpl_9RGuGWVp8gddhfj9SWrV6ubXPuQT` READY sur SHA main exacte. Deux sous-tests intégrés UI/API/PostgreSQL ajoutés (absence de session et session archivée), un garde statique historique adapté. Les CI rouges intermédiaires ont été corrigées sur la même branche, sans contournement.
- Éléments existants : Studio `src/app/agent/daily/candidatures/[id]/page.tsx` traite analyse humaine/prérequis ; Daily `app/api/client/daily/registration-requests/route.ts` gère décision/inscription atomique et délégation auditée. Anciennes PR #349/#357/#361/#365 ouvertes, non dupliquées.
- Critères d'acceptation restant à recetter : dépôt public candidature/positionnement, revue et analyse humaine horodatée Studio, décision autorisée OF/déléguée, inscription unique, visibilité Daily/Studio, accès ponctuels et notifications réelles en sandbox, refus et états d'erreur, isolation de deux OF, conservation historique/tâches. Aucun compte de test authentifié multi-OF ni boîte mail sandbox disponible pour prouver cette chaîne complète.
- **Prochaine action unique :** étendre le test intégré du parcours P0-01 depuis le dépôt public de candidature jusqu'à la transition analyse Studio `pending → ready_for_of`, puis décision OF → inscription sur deux OF fictifs. Ne pas changer de parcours tant que cette chaîne n'est pas prouvée ou bloquée explicitement.

## Matrice des parcours — état au 01/11/2026
| ID | Parcours / critères d'acceptation | État | Preuve, blocage, action |
| --- | --- | --- | --- |
| P0-01 | Candidature → analyse → décision OF/déléguée → inscription unique et notification multi-OF | À RECETTER | #492, HEAD `db56e63`, main `f2db26a`, 2243 tests PASS ; recette authentifiée/sandbox absente ; étendre test de dépôt public |
| P0-02 | Avant : programme, session, prérequis, documents et diffusion prouvée | À AUDITER | Tests partiels ; auditer chaîne complète |
| P0-03 | Pendant : présence individuelle, signature formateur, absences, PDF sécurisé | À AUDITER | Tester droits et PDF/signatures fictives |
| P0-04 | Évaluations, acquis, satisfaction et parties prenantes | À AUDITER | Vérifier réponses, résultats et tâches |
| P0-05 | Après : complétude, clôture, attestations et régularisations | À AUDITER | Vérifier session fictive et blocages |
| P0-06 | Tâches/relances Daily ↔ Studio, décisions manuelles persistantes, traçabilité | À AUDITER | Studio #448 fusionnée ; recette réelle des deux dashboards manquante |
| P0-07 | Apprenant : liens ponctuels, documents, actions, erreurs, isolation | À AUDITER | Sans compte permanent V1 ; vérifier expiration et accès |
| P0-08 | Formateur : affectation, suivi, émargement, évaluations, notifications | À AUDITER | Vérifier parcours complet multi-OF |
| P0-09 | Entreprise : documents, satisfaction, données autorisées, notifications | À AUDITER | Vérifier emails partagés et identité |
| P0-10 | OF : manager, décision, délégation Studio, navigation et permissions | À AUDITER | Vérifier rôles et assistance authentifiée |

États autorisés : À AUDITER ; NON DÉVELOPPÉ ; CODÉ NON TESTÉ ; TESTS AUTOMATISÉS OK ; À RECETTER ; BLOQUÉ ; TERMINÉ. **TERMINÉ uniquement sur preuve de recette bout-en-bout authentifiée.**

## Mesures et delta
- **Total 10 ; TERMINÉ 0 ; restant à valider 10 ; À RECETTER 1 ; À AUDITER 9.**
- Bloqués pour recette authentifiée : **1 parcours (P0-01)**, faute de comptes/sessions fictifs et messagerie sandbox. Ce blocage n'est pas un incident de production.
- Delta depuis la fiche initiale : **0 clôturé**, **-1 À AUDITER**, **+1 À RECETTER**. Le code et les tests avancent, mais le nombre de parcours TERMINÉS ne bouge pas.

## Compte rendu de passage
- Lot fonctionnel P0-01 : sélection de session sûre et explicite ; aucun changement de données métier, mail réel, signature, migration ou autre automatisation.
- GitHub/Preview/production : preuves SHA et états ci-dessus ; Studio inchangé.
- Tests locaux complets hors CI : indisponibles (DNS GitHub du conteneur), CI et build GitHub vérifiés ; recette mobile/multi-OF authentifiée NON EFFECTUÉE.
- Cahier maître : écriture `FAILED_PRECONDITION` ; passation enregistrée puis relue dans le [journal complémentaire Selen](https://docs.google.com/document/d/1WNJM7EkWlB4a9X_Acnr9nXSXyyx_IxSvqxH3_H-rdMQ/edit).
- Fiche unique : présente mise à jour documentaire sur branche/PR, à relire après écriture et à fusionner seulement avec contrôles CI/Preview.

## Passage complémentaire P0-01 — 01/11/2026, 23h (Paris)
- Après #493 fusionnée (Daily main `76c753e36a4ae3e9eb752dfcfd2395b813555cdc`), extension sur branche `test/daily-p0-candidature-multi-of-handoff-20261101` du test intégré réel **page Daily → API déléguée → RPC PostgreSQL/PGlite**.
- Deux sous-tests candidats : (1) décision refusée tant que l'analyse Studio n'a pas abouti, puis transition simulée `pending → ready_for_of` et inscription ; (2) deux OF fictifs, refus du dossier et de la session étrangers, aucune notification ni écriture, puis inscription locale.
- **Limite explicite :** le dépôt public et l'action serveur Studio ne sont PAS exécutés dans ces nouveaux sous-tests. La transition Studio est simulée dans la fixture SQL ; ne pas annoncer un E2E complet ni une recette authentifiée. Aucun email réel envoyé.
- **Statut : À RECETTER** inchangé ; nouveaux sous-tests à valider par CI sur HEAD exacte. Aucun parcours TERMINÉ. Mesures : 10 au total, 0 terminé, 10 restant à valider, 1 à recetter, 9 à auditer, 1 bloqué en recette authentifiée. Delta depuis le passage précédent : 0 clôturé, 0 nouveau blocage.
- **Prochaine action unique :** contrôler les tests/TS/ESLint/build, CI et Preview de cette branche ; corriger sur la même branche si rouge, puis fusionner seulement après protections. Ensuite tester réellement le POST public de candidature et l'action d'analyse Studio avec deux OF fictifs, puis recette sandbox authentifiée.
- Aucune donnée réelle, migration, signature, mail réel, ni autre automatisation modifiée.

## Répartition
- **Développement horaire :** propriétaire de l'action active, code/tests, mise à jour de cette fiche.
- **Work contrôle :** contrôle CI/Preview/production, vérification indépendante des preuves et indicateurs; ne change pas la prochaine action sans motif documenté.
- **Cahier maître :** règles métier, décisions, périmètre et historique de référence; ne pas le remplacer par cette fiche.

## Reprise P0-01 — 01/11/2026, 23h41 (Paris), dépôt public
- État initial contrôlé : Daily main `aa6674e09bcb6f74ee0432719ce45495af569adf` après fusion #494 ; Studio main `a7e94a5784b5c666dbd121cd936e0000b48a6ae5`. #494 : deux sous-tests d'intégration, transition Studio **simulée** ; aucune recette E2E authentifiée.
- **Maillon public effectivement examiné :** `app/api/daily-registration/[token]/route.ts`, GET/POST candidature avec jeton ponctuel. Deux branches d'échec d'insertion (formation et session) renvoyaient directement `error.message` SQL au candidat. Correction sur `test/p0-public-candidature-route-20261101` : réponse générique HTTP 500 et `Cache-Control: no-store` sans modifier les écritures métier.
- Tests runtime ajoutés `tests/dailyPublicCandidatureRoute.test.mjs` : dépôt POST réel sur formation A/session A, refus session étrangère OF B sans écriture ni email, absence de fuite SQL sur insertion formation et session. Faux Supabase et envoi email simulés : **pas** de recette authentifiée, ni d'exécution réelle de l'action Studio.
- **État du lot à cette écriture :** branche candidate, tests/TS/ESLint/build/CI/Preview à vérifier sur HEAD exacte ; ne pas fusionner si non prouvés. Les preuves finales et la décision de fusion doivent être ajoutées après contrôles.
- **Mesure :** 10 parcours ; TERMINÉ 0 ; restant à valider 10 ; À RECETTER 1 (P0-01) ; À AUDITER 9 ; bloqué pour recette authentifiée 1 ; delta parcours TERMINÉS **0**, delta blocages **0**.
- **Protocole de recette P0-01 :** créer deux OF fictifs A/B, comptes distincts OF et agent Studio autorisé, formation et sessions de test, boîte mail sandbox sans destinataire réel. Soumettre candidature via jeton public de A avec positionnement et signature de test effectuée par son titulaire ; vérifier ligne `pending` et aucune inscription. Agent Studio authentifié A examine pièces et analyse : vérifier auteur/date, `ready_for_of` et notification sandbox ; tenter depuis B et vérifier refus et absence de fuite. OF A accepte avec choix de session A : vérifier inscription unique, pièces et tâches Daily/Studio, lien apprenant ponctuel et notifications sandbox ; rejouer l'action pour prouver idempotence. Tester refus, jeton expiré, session B interdite, recharge mobile, historique et journal. **Aucune étape authentifiée exécutée ici.**
- **Prochaine action unique :** valider le lot public POST sur HEAD (tests runtime, non-régression, TypeScript, ESLint, build, CI, Preview), corriger sur la même branche si rouge, puis fusionner seulement avec protections et vérifier production SHA ; ensuite reprendre le maillon **action serveur Studio réelle** sur deux OF fictifs, sans modifier de données réelles.


## Contrôle technique et pilotage — 02/11/2026, 00h30 (Paris)
- **Correction de statut P0-01 : TESTS AUTOMATISÉS OK / À RECETTER.** La PR Daily [#495](https://github.com/crislilredaction-commits/selen-editions-site/pull/495), HEAD `8dfa8dcd3e09577c0bf6af908cffa20e5042ff87`, est fusionnée sur main `3eab442581ce18c6e9ab9bdbde12ed30b5d44ac3`. Cette preuve remplace l'état « branche candidate » du passage précédent, sans déclarer le parcours TERMINÉ.
- Tests/CI : Automated Tests GitHub `41358929311` SUCCESS et Selen local check `41358929334` SUCCESS sur la SHA main. Les quatre tests runtime du POST public couvrent dépôt valide, rejet d'une session d'un autre OF sans écriture/email, et masquage des erreurs SQL d'insertion.
- Preview : `dpl_GqRWCwDuUSv8jF6G2tqnXeyLiKWu` READY, `aliasError: null`, SHA exacte `8dfa8dcd3e09577c0bf6af908cffa20e5042ff87`.
- Production Daily : `dpl_3NamTd42RiHY8KAmRAifjW5fgSqs` READY, `aliasError: null`, SHA exacte main `3eab442581ce18c6e9ab9bdbde12ed30b5d44ac3`. Production Studio : `dpl_FgbH4CLbu6r36c5SLb7dkkQyoLwQ` READY, `aliasError: null`, SHA exacte main `a7e94a5784b5c666dbd121cd936e0000b48a6ae5`.
- Incidents techniques actifs sur les HEAD actuelles : **0**. Aucun rerun, redéploiement ni changement de configuration CI. Les anciens échecs de commits remplacés ne sont pas comptés comme incidents ouverts.
- Matrice : **10 parcours ; TERMINÉ 0 ; restant à valider 10 ; TESTS AUTOMATISÉS OK / À RECETTER 1 (P0-01) ; À AUDITER 9 ; bloqué pour recette authentifiée 1.** Delta depuis le passage précédent : TERMINÉ **0**, restant **0**, bloqués **0**.
- Blocage : aucune preuve de recette authentifiée multi-OF ni boîte mail sandbox ; CI et Vercel verts ne valent pas recette métier. Aucun compte ni donnée réelle n'a été utilisé.
- **Prochaine action unique (développement horaire) :** exécuter réellement l'action serveur d'analyse Studio `pending → ready_for_of` avec deux OF fictifs dans le test intégré, puis seulement organiser la recette sandbox authentifiée du parcours complet. Ne pas changer de chantier et ne pas dupliquer P0-01.


## Développement horaire P0-01 — 02/11/2026, 00h39 (Paris) : action Studio réelle
- Sources contrôlées : cahier maître et journal complémentaire ; Daily main `7aee63d74f3af0a797a5dcbb6da6be4c0f7f963f` après #496 documentaire ; Studio main `a7e94a5784b5c666dbd121cd936e0000b48a6ae5` ; PR ouvertes des deux dépôts vérifiées, notamment Daily #349/#357/#361/#365 laissées intactes.
- **Maillon traité :** l'action serveur réelle Studio `saveAnalysis` de `src/app/agent/daily/candidatures/[id]/page.tsx`. Lot Studio [#449](https://github.com/crislilredaction-commits/selen-studio/pull/449), branche `test/p0-studio-candidature-multiof-analysis-20261102`, HEAD `a6ac8538768c42ef64d9b7bdb774b47d8cf74269`. Test dynamique ajouté sur deux OF/agents fictifs : refus de lecture/transmission croisée, transition effective `pending → ready_for_of`, identité de l'agent, email simulé dirigé au bon OF, absence d'acceptation automatique. Correction ciblée : ne plus divulguer le message SQL brut si l'enregistrement de l'analyse échoue ; test de non-notification en échec.
- **État : PR #449 ouverte, CI/Preview à vérifier sur la HEAD exacte ; NON fusionnée à cette passation.** Ne pas prétendre tests PASS, Preview READY, production ni recette authentifiée tant que les preuves ne sont pas recueillies. Les tests Studio appellent la server action réelle avec Supabase simulé ; le POST public Daily et la décision OF ne sont pas encore exécutés dans une seule chaîne E2E inter-dépôts.
- **Matrice :** P0-01 `CODÉ NON TESTÉ` pour le nouveau lot, état métier global `TESTS AUTOMATISÉS OK / À RECETTER` sur les précédentes PR #492/#494/#495. P0-02 à P0-10 : À AUDITER. Total 10, TERMINÉ 0, restant 10, à recetter 1, à auditer 9, bloqué pour recette authentifiée 1. Delta TERMINÉ 0, restant 0, bloqués 0.
- **Critères restant à prouver :** dépôt public et analyse Studio dans un scénario E2E unique, décision OF authentifiée, inscription unique, PDF/liens ponctuels et notifications sandbox, isolation multi-OF en situation réelle, mobile et historique/tâches. Pas de comptes de test ni boîtes sandbox disponibles ; aucune donnée réelle, email réel, signature, migration ni autre automatisation modifiée.
- **Prochaine action unique :** vérifier tests/TypeScript/ESLint/build GitHub et Preview Vercel de Studio #449 sur SHA exacte ; corriger sur cette même branche si rouge ; fusionner seulement avec protections, vérifier CI main/production SHA, puis poursuivre l'E2E inter-dépôts en sandbox sans changer de parcours.


### Validation finale Studio #449 — 02/11/2026 (Paris)
- **Studio #449 fusionnée squash**, HEAD PR `a6ac8538768c42ef64d9b7bdb774b47d8cf74269`, CI `Studio PR validation` run `41363357285` **SUCCESS** (tests unitaires/intégration, ESLint, TypeScript, build). Preview Vercel `dpl_B3FTrKykwouunyy166J8MJ5Rdopb` **READY** sur HEAD exacte, `aliasError=null`, mergeability vérifiée avant fusion.
- Studio main après fusion `adcd01565e398b83d8aacebfbde1660c1fe98fd6`, production Vercel `dpl_3F67ygq1WruLWfnpqVFav6XGCE4s` **READY** sur cette SHA exacte, `aliasError=null`, domaines `studio.selen-editions.fr` et `selen-studio.vercel.app` associés. CI post-fusion Studio main **non prouvée** (workflow PR uniquement, aucune check-run retournée sur la SHA main) ; ne pas la déclarer SUCCESS.
- L'action réelle `saveAnalysis` a été exécutée en tests isolés Studio pour deux OF/agents fictifs ; la décision OF et le POST public ne sont pas dans **ce même** test inter-dépôts. **P0-01 : TESTS AUTOMATISÉS OK / À RECETTER, pas TERMINÉ**. Mesures 10 total, 0 terminé, 10 restant, 1 à recetter, 9 à auditer, 1 bloqué pour recette authentifiée, delta 0.
- **Prochaine action unique :** rapprocher les scénarios testés Daily (POST public et décision) et Studio (action réelle), puis exécuter une recette authentifiée complète sur deux OF fictifs avec email sandbox ; sans comptes/sessions, conserver À RECETTER. Ne pas modifier les autres parcours ni les automatisations.


## Développement horaire P0-01 — 02/11/2026, 01h41 (Paris) : erreurs décision OF / délégation
- Daily main initial `271ca8a109a90be83719117482d24337ba9cc29c`, Studio main `adcd01565e398b83d8aacebfbde1660c1fe98fd6`, PR #497/#449 déjà fusionnées. Cahier maître et journal relus ; pas de doublon.
- Recette authentifiée bloquée faute de comptes fictifs A/B, sessions et emails sandbox. Anomalie confirmée : erreurs SQL brutes des décisions OF et Studio déléguées, matérialisation, régularisation et lecture.
- Lot sur branche `fix/p0-registration-decision-errors-20261102-0141` : réponses génériques 503 en cas de panne SQL, messages métier explicites 400/403/404/409, aucun changement des RPC, droits, transactions ou envois ; 7 tests runtime de non-divulgation, droits, refus inter-OF, absence de notification.
- **État candidat** : tests/TypeScript/ESLint/build/CI/Preview à contrôler sur HEAD exacte ; aucune fusion ni production prétendue. Corriger sur même branche si échec.
- Mesure : 10 parcours, TERMINÉ 0, restant 10, P0-01 TESTS AUTOMATISÉS OK sur lots précédents / À RECETTER authentifié, 9 À AUDITER, 1 bloqué pour recette ; delta terminés 0, bloqués 0.
- **Prochaine action unique :** valider CI/Preview de ce lot et fusionner uniquement après protections ; puis recette sandbox publique → Studio réelle → décision OF → inscription sur deux OF fictifs, sans données réelles.

- **CI rouge intermédiaire identifiée sur HEAD deed50a7 :** 2252/2256 tests PASS, 4 échecs de non-régression attendent HTTP 409 pour les rejets atomiques PostgreSQL (intégrité 23502/23514 et exception métier P0001). Sept nouveaux tests P0-01 PASS. Correction sur la MÊME branche : conserver 409 sans fuite SQL pour ces codes et ajouter trois tests dédiés ; relancer toute la CI, ne pas fusionner avant SUCCESS.

- **Deuxième contrôle CI sur HEAD 39528bed :** 2258/2259 PASS, dernier échec historique de rejet atomique sans code SQL (`materialization failed`) attendu en HTTP 409. Ajout d'un message métier sûr pour ce cas et d'un test runtime supplémentaire, toujours sur la même PR #498. Nouvelle HEAD à valider intégralement ; pas de fusion sur CI rouge.

### Contrôle technique PR #498 — 02/11/2026 (Paris)
- HEAD de code `3e99257e1418641348a12177dc44d3f9911d5015` : **2260/2260 tests PASS**, Automated Tests run `41369484285` SUCCESS ; Selen local check runs `41369484298` (PR) et `41369480182` (push) SUCCESS, couvrant tests, TypeScript, ESLint ciblé et build. Les deux HEAD intermédiaires rouges ont été corrigées sur la même branche, sans désactiver les protections.
- Preview Vercel `dpl_C5wDTWmLHoS1qAHkvSK4aQDN2641` READY, `aliasError=null`, SHA exacte `3e99257e1418641348a12177dc44d3f9911d5015`. PR #498 mergeable. Cette mise à jour documentaire crée une nouvelle HEAD qui doit elle-même repasser CI/Preview avant fusion.
- **Limite métier :** aucune recette authentifiée ni sandbox inter-dépôts, P0-01 reste TESTS AUTOMATISÉS OK / À RECETTER. 0/10 TERMINÉ, 10 à valider, 1 bloqué pour recette ; delta 0. Prochaine action : contrôles finaux sur HEAD documentaire puis fusion/production SHA, ensuite recette E2E fictive.

## Développement P0-02 — 02/11/2026, 02h38 (Paris) : garde de diffusion des convocations
- Contrôle préalable : cahier maître, journal complémentaire, HEAD Daily `fdd74dc01104a6b4e1f9e24ca5fddf091dbe43e1` (#498 fusionnée), Studio `adcd01565e398b83d8aacebfbde1660c1fe98fd6`, PR ouvertes, tests existants et présent fichier relus. **P0-01 bloqué pour recette authentifiée** (deux OF fictifs, sessions, comptes et boîte sandbox absents) ; bascule temporaire justifiée sur P0-02, sans déclarer P0-01 terminé.
- Anomalies prouvées dans `app/api/client/daily/pretraining-documents/send/route.ts` : envoi de convocation encore permis si session `cancelled` ; trois erreurs SQL de lecture exposées au client ; réponse d'envoi avec destinataire sans directive anti-cache.
- Lot cohérent proposé : interdire les sessions annulées avant stockage/envoi, répondre 503 sans SQL brut sur lecture document/inscription/session, `Cache-Control: private, no-store` sur confirmation d'envoi. Étendre le test runtime existant `dailyConvocationEmailProof.test.mjs` : annulation, trois pannes SQL, absence d'envoi/écriture et cache privé. Aucun email réel, donnée réelle, migration ou signature.
- **Statut à cette passation : branche candidate à vérifier par tests ciblés/complets, TS, ESLint, build, CI et Preview sur SHA exacte ; ni fusion ni production présumées.** P0-02 : CODÉ NON TESTÉ pour ce nouveau lot, et **À RECETTER** pour le parcours complet avant formation. P0-01 : TESTS AUTOMATISÉS OK / À RECETTER. P0-03 à P0-10 : À AUDITER.
- Matrice : 10 parcours, TERMINÉ 0, restant 10, à recetter 2 (P0-01 et P0-02), à auditer 8, bloqué pour recette authentifiée 1 (P0-01), delta TERMINÉ 0, delta restant 0, delta bloqué 0. Aucune recette authentifiée réalisée.
- Protocole P0-02 : deux OF fictifs A/B, sessions active/annulée, inscriptions et convocations validées, boîtes email sandbox ; vérifier accès OF A seul, refus croisé B, annulation sans envoi ni preuve, diffusion une seule fois sur session active avec preuve liée au document/version, refus doublon et panne, contrôle des en-têtes et rechargement mobile. Ne pas utiliser de vrais destinataires.
- **Prochaine action unique :** contrôler les tests, TS/ESLint/build et CI/Preview du lot sur sa HEAD ; corriger sur la même branche si rouge ; fusionner uniquement après contrôles et vérifier CI/production SHA. Ensuite reprendre P0-02 ou P0-01 selon disponibilité effective de la sandbox, sans créer de copie dans Studio.


## Contrôle technique et pilotage — 02/11/2026, 03h30 (Paris)
- **Incidents techniques actifs : 0.** Aucun rerun ni redéploiement d'un état vert ; aucune modification de code, configuration CI, données, email, signature ou migration.
- Daily main `9658a2e1b92f6a50bf8ecd9907afab225f9a14c1` après [#499](https://github.com/crislilredaction-commits/selen-editions-site/pull/499). HEAD PR `e2c6ada32bf053703bca9de8bb3ddf25b422a729` : Automated Tests `41373711435` SUCCESS, Selen local check `41373711415` SUCCESS, Preview `dpl_FbzB4h1c9Wm2w22nvfxzvoT4kyck` READY. Post-fusion main : Automated Tests `41374120008` SUCCESS (2265/2265), Selen local check `41374119999` SUCCESS ; production `dpl_AkiUkbCujVNugP4vyfFYJ38on8Ef` READY, `aliasError=null`, SHA exacte.
- Studio main `adcd01565e398b83d8aacebfbde1660c1fe98fd6` après #449 ; production `dpl_3F67ygq1WruLWfnpqVFav6XGCE4s` READY, `aliasError=null`, SHA exacte. #363 est fermée ; aucune intervention.
- **P0-01 — TESTS AUTOMATISÉS OK / À RECETTER.** Dépôt public, action Studio réelle isolée, décision OF/déléguée et isolation multi-OF sont couverts par tests séparés ; pas de recette authentifiée inter-dépôts complète. Blocage : comptes/sessions A/B et boîte email sandbox absents.
- **P0-02 — TESTS AUTOMATISÉS OK / À RECETTER.** #499 interdit les convocations des sessions annulées, masque trois erreurs SQL et protège du cache la confirmation privée ; cinq tests runtime ajoutés. Critères restant à recetter : deux OF fictifs, sessions active/annulée, droits croisés, version documentaire, diffusion unique, preuve persistée et notifications sandbox.
- **P0-03 à P0-10 — À AUDITER.** Aucun élément nouveau ne justifie un changement de statut ou un TERMINÉ.
- **Mesure : 10 parcours ; TERMINÉ 0 ; restant à valider 10 ; TESTS AUTOMATISÉS OK / À RECETTER 2 ; À AUDITER 8 ; bloqué pour recette authentifiée 1.** Delta depuis le contrôle précédent : TERMINÉ 0, restant 0, à recetter **+1**, à auditer **-1**, bloqués 0.
- **Relais priorisé :** poursuivre P0-02 par un audit substantiel du parcours Avant/documents tant que la sandbox authentifiée reste indisponible ; éviter les micro-PR. Revenir à la recette P0-01/P0-02 dès que comptes fictifs et boîte sandbox existent. Ne pas ouvrir P0-03.


## Développement P0-02 — 02/11/2026, 03h40 (Paris) : consultation, génération et téléchargement Avant
- Sources : cahier maître et journal complémentaire relus ; Daily main `23126ced98bde4fb586c98a278cfc270740f6631` après #500 ; Studio main `adcd01565e398b83d8aacebfbde1660c1fe98fd6`. #499/#500 déjà fusionnées ; P0-01 bloqué pour recette authentifiée faute de deux OF/comptes/sessions et messagerie sandbox.
- **Maillons manquants confirmés** dans les routes préformation : GET ignorait une panne SQL de lecture des inscriptions et pouvait afficher une liste incomplète ; GET exposait des erreurs SQL et interpolait un identifiant session non validé dans un filtre PostgREST ; POST de génération exposait les messages SQL/Storage et répondait 400 pour des pannes serveur ; téléchargement confondait panne SQL et document absent, et la redirection signée n'interdisait pas le cache.
- **Lot candidat** sur `fix/p0-pretraining-documents-read-security-20261102-0340` : contrôle syntaxe UUID de session, erreurs serveur génériques 503, échec fermé sur liste incomplète, réponses privées `no-store`, distinction 404 absent/503 panne, redirection signée privée 120 s. Tests runtime dédiés GET/téléchargement et adaptation des régressions génération/retirement. Les validations métier 400 restent distinctes. Pas de suppression de preuves, de mails, de signature ou de données réelles.
- **État à cette écriture :** code et tests proposés, CI/TypeScript/ESLint/build/Preview encore À VÉRIFIER sur HEAD exacte ; ni fusion ni production prétendues. P0-02 : TESTS AUTOMATISÉS OK sur #499 / nouveau lot CODÉ NON TESTÉ, À RECETTER authentifié. P0-01 : TESTS AUTOMATISÉS OK / À RECETTER ; P0-03 à P0-10 À AUDITER.
- **Mesure :** 10 parcours ; TERMINÉ 0 ; restant à valider 10 ; À RECETTER 2 ; À AUDITER 8 ; bloqué authentifié 1 ; delta TERMINÉ 0, restant 0, bloqués 0.
- **Protocole P0-02 :** deux OF fictifs A/B, sessions active/annulée, inscriptions fictives, documents de chaque type validés et versionnés, stockage sandbox et messagerie sandbox. Vérifier affichage complet, absence de données croisées, refus des sessions annulées, téléchargement 120 s et expiration, génération/reprise après échec, diffusion unique et preuve horodatée, recharge mobile, droits OF/délégation. Sans ces ressources, rester À RECETTER.
- **Prochaine action unique :** vérifier tests ciblés/non-régression, TypeScript, ESLint et build sur HEAD ; corriger sur cette branche si rouge, puis CI SUCCESS et Preview READY sur SHA exacte avant fusion ; vérifier CI main et production SHA. Ne pas changer de parcours ni modifier d'automatisation.

- **Contrôle CI intermédiaire sur HEAD `7e9b8447` :** Automated Tests rouge (2271/2274, deux sous-tests métier en échec) : une session étrangère/absente était désormais traitée comme panne 503 au lieu du refus métier 400 attendu. Correction sur la MÊME branche : distinguer absence de session (y compris PGRST116, réponse 400 sûre) et panne SQL réelle (503 générique). Relancer CI et Preview sur la nouvelle HEAD, aucune fusion tant que rouge.
