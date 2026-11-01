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

## Répartition
- **Développement horaire :** propriétaire de l'action active, code/tests, mise à jour de cette fiche.
- **Work contrôle :** contrôle CI/Preview/production, vérification indépendante des preuves et indicateurs; ne change pas la prochaine action sans motif documenté.
- **Cahier maître :** règles métier, décisions, périmètre et historique de référence; ne pas le remplacer par cette fiche.
