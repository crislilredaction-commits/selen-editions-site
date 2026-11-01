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
- Identifiant : **SELEN-P0-CANDIDATURE**
- Parcours : candidature publique → décision OF → inscription → visibilité cohérente Daily/Studio.
- État : **À AUDITER** (aucune recette complète vérifiée dans cette fiche).
- Propriétaire de l'exécution : tâche « Selen développement horaire ».
- Références de départ à revérifier : Daily main `2a375a571be8f1bef317990944b10f009106ad06` (PR #490); Studio main `a7e94a5784b5c666dbd121cd936e0000b48a6ae5` (PR #448).
- Blocage : **non encore qualifié**; ne pas inventer.
- **Prochaine action unique :** établir une matrice de critères d'acceptation de ce parcours en confrontant cahier maître, routes UI/API, tests et PR existantes dans les deux dépôts; identifier le PREMIER maillon non prouvé puis le corriger/tester.
- Critères de fin : dépôt candidature; traitement et décision autorisée OF/agent délégué; rattachement session; inscription créée; synchronisation et permissions multi-OF; états d'erreur et notifications prévus; recette avec comptes fictifs.
- Dernière preuve de recette authentifiée : **aucune inscrite**.
- Dernière mise à jour : 2026-11-01, initialisation de la méthode; état fonctionnel à confirmer.

## Matrice des parcours (initialisation, aucun chiffre d'achèvement revendiqué)
| ID | Parcours | État | Preuve / blocage à renseigner |
| --- | --- | --- | --- |
| P0-01 | Candidature → décision → inscription | À AUDITER | Chantier actif |
| P0-02 | Avant formation : programmes, documents, diffusion | À AUDITER | — |
| P0-03 | Pendant : émargement apprenant/formateur, absences, PDF | À AUDITER | — |
| P0-04 | Évaluations, acquis, satisfaction, parties prenantes | À AUDITER | — |
| P0-05 | Après : clôture, attestations, régularisations | À AUDITER | — |
| P0-06 | Tâches, relances et synchronisation Daily ↔ Studio | À AUDITER | — |
| P0-07 | Portail apprenant, liens ponctuels sécurisés | À AUDITER | — |
| P0-08 | Portail formateur | À AUDITER | — |
| P0-09 | Portail entreprise | À AUDITER | — |
| P0-10 | Portail organisme de formation et délégation Studio | À AUDITER | — |

États autorisés : À AUDITER; NON DÉVELOPPÉ; CODÉ NON TESTÉ; TESTS AUTOMATISÉS OK; À RECETTER; BLOQUÉ; TERMINÉ. Une preuve et la date sont exigées pour toute transition.

## Compte rendu minimal à chaque activation
- Chantier et action exécutée :
- HEAD/PR et tests réellement vérifiés :
- Parcours terminés / à recetter / bloqués / non audités :
- Évolution depuis dernière exécution (et justification) :
- Blocage humain ou technique :
- **Prochaine action unique** :
- Fiche sauvegardée puis relue : OUI/NON (sinon raison) :

## Répartition
- **Développement horaire :** propriétaire de l'action active, code/tests, mise à jour de cette fiche.
- **Work contrôle :** contrôle CI/Preview/production, vérification indépendante des preuves et indicateurs; ne change pas la prochaine action sans motif documenté.
- **Cahier maître :** règles métier, décisions, périmètre et historique de référence; ne pas le remplacer par cette fiche.
