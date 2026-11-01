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
- Parcours : candidature publique → analyse agent Studio → décision OF ou délégation identifiée → inscription et accès ponctuels.
- État au 01/11/2026 : **CODÉ NON TESTÉ pour le lot #492**, CI en cours ; les précédents tests automatisés du socle ne constituent pas une recette authentifiée.
- HEAD de référence avant lot : Daily main `b850a44b68b055e2e9ce24386d4556dd2d4d6c61` (fiche #491 fusionnée, pas de nouveau code métier), Studio main `a7e94a5784b5c666dbd121cd936e0000b48a6ae5` (#448 déjà fusionnée).
- PR active : [Daily #492](https://github.com/crislilredaction-commits/selen-editions-site/pull/492), branche `fix/daily-candidature-explicit-session-20261101`, HEAD code corrigée `7350c8d17a5c125f5dd7e722a92527edc874a0e3` (avant présente mise à jour documentaire).
- Maillon identifié : l'interface Daily sélectionnait silencieusement la première session compatible si aucune session n'était attachée à la candidature. Une décision OF pouvait donc inscrire dans une session non explicitement choisie. Les choix périmés pouvaient rester en mémoire au rechargement.
- Correctif candidat : aucun choix implicite ; maintien seulement d'une sélection compatible et explicite ou d'une session déjà attachée ; contrôle avant confirmation et écriture ; filtrage des sessions archivées/annulées ; libellés accessibles ; deux nouveaux sous-tests intégrés UI/API/PGlite (choix explicite, session archivée). Aucun schéma/migration, aucune donnée réelle.
- Première CI du lot : HEAD `7a9908a23b0ca9841ff319d10b81bba7f7fd3bf7`, 2240/2243 tests PASS, 3 FAIL (un test utilisait un statut SQL interdit par la fixture ; une assertion historique attendait l'ancien libellé ; échec parent induit). Corrections poussées sur la **même branche** en `7350c8d17a5c125f5dd7e722a92527edc874a0e3`. CI finale à vérifier, ne pas fusionner sans succès complet et Preview READY sur HEAD exacte.
- Existant revérifié : Studio `src/app/agent/daily/candidatures/[id]/page.tsx` réalise l'analyse et les prérequis ; Daily `app/api/client/daily/registration-requests/route.ts` applique RPC atomique décision/inscription, et délégation auditée. Les anciennes PR #349/#357/#361/#365 sont ouvertes, non fusionnées et n'ont pas été dupliquées.
- Critères d'acceptation P0-01 : dépôt candidature et positionnement ; analyse humaine horodatée Studio et vérification des prérequis ; décision OF ou agent Studio autorisé et identifié ; choix explicite d'une session compatible ; inscription unique et visible Daily/Studio ; envoi des liens ponctuels selon statut réel ; refus/erreurs compréhensibles ; isolation entre deux OF ; historique et tâches cohérents.
- **Blocage de recette** : aucun compte/jeu de sessions fictifs authentifiés dédié n'a été fourni pour vérifier la chaîne complète, notamment les permissions multi-OF, notifications et email sandbox. Ne pas déclarer TERMINÉ.
- **Prochaine action unique :** contrôler la CI et la Preview de la HEAD courante de la PR #492 ; corriger sur cette même branche si rouge, sinon actualiser cette fiche et fusionner uniquement après les garde-fous. Après livraison, étendre le test intégré au dépôt public et au passage analyse Studio → décision OF → inscription sur deux OF fictifs.

## Matrice des parcours — suivi au 01/11/2026
| ID | Parcours et critère d'acceptation | État | Preuve, blocage, prochaine validation |
| --- | --- | --- | --- |
| P0-01 | Candidature → analyse Studio → décision OF/déléguée → inscription unique, notification, multi-OF | CODÉ NON TESTÉ | #492 HEAD code `7350c8d` ; CI corrigée en cours ; recette authentifiée manquante ; contrôler CI puis chaîne fictive |
| P0-02 | Avant : création programme/session, prérequis, documents diffusés avec preuve | À AUDITER | Routes et tests existent ; vérifier parcours intégral et publication réelle en sandbox |
| P0-03 | Pendant : présence individuelle, signature formateur, absences, PDF sécurisé | À AUDITER | Tests partiels historiques ; vérifier signatures/PDF et droits multi-OF |
| P0-04 | Évaluations et satisfaction de tous les rôles, résultat pédagogique correct | À AUDITER | Tests partiels historiques ; vérifier réponse → résultat → tâche |
| P0-05 | Après : complétude, clôture, attestations, régularisations | À AUDITER | Vérifier preuves et blocages de clôture avec session fictive |
| P0-06 | Tâches Daily ↔ Studio : source unique, décisions manuelles persistantes, traçabilité | À AUDITER | Studio #448 fusionnée ; recette persistance/rechargement/multi-OF non effectuée |
| P0-07 | Apprenant : liens ponctuels sécurisés, documents, actions, erreurs | À AUDITER | Vérifier rôle sans compte permanent, expiration, données autorisées |
| P0-08 | Formateur : affectation, suivi, émargement, évaluations, alertes | À AUDITER | Vérifier parcours complet et séparation OF |
| P0-09 | Entreprise : documents, informations autorisées, satisfaction, notifications | À AUDITER | Vérifier identité et droits sur cas email partagé |
| P0-10 | OF : gestionnaire, décision, délégation Studio, navigation et droits | À AUDITER | Vérifier droits manager et délégation réelle, mobile |

États autorisés : À AUDITER; NON DÉVELOPPÉ; CODÉ NON TESTÉ; TESTS AUTOMATISÉS OK; À RECETTER; BLOQUÉ; TERMINÉ. **TERMINÉ exige une recette authentifiée de bout en bout prouvée.**

## Mesures comparées à l'initialisation
- Total : **10** parcours ; **0 TERMINÉ**, **10 restant à valider**.
- **1** parcours en correction/test (P0-01), **9** non audités ; **1** parcours nécessitant une recette authentifiée avec comptes fictifs (ne pas confondre avec une panne de production).
- Delta depuis la fiche initiale : **0** parcours clos ; **-1** À AUDITER, **+1** CODÉ NON TESTÉ ; aucune validation inventée.

## Compte rendu de passage
- Chantier : P0-01, sélection explicite et compatible de session à la décision.
- Preuve : Daily main `b850a44b`, Studio main `a7e94a57`, PR #492 candidate ; premier run CI rouge documenté, corrections sur même branche, Preview/CI finale à vérifier.
- Tests locaux complets : impossibles (DNS GitHub indisponible pour checkout), ne pas prétendre exécutés.
- Aucune donnée réelle, email, signature, migration ou autre automatisation modifiée.
- Fiche de reprise : mise à jour sur branche PR #492, lecture après écriture obligatoire. Cahier maître : à journaliser si écriture possible, sinon journal complémentaire explicite.

## Répartition
- **Développement horaire :** propriétaire de l'action active, code/tests, mise à jour de cette fiche.
- **Work contrôle :** contrôle CI/Preview/production, vérification indépendante des preuves et indicateurs; ne change pas la prochaine action sans motif documenté.
- **Cahier maître :** règles métier, décisions, périmètre et historique de référence; ne pas le remplacer par cette fiche.
