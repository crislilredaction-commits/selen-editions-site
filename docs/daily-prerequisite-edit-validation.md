# Modification du programme importé et des prérequis

Une modification ordinaire du catalogue omettait le mode de création et la déclaration structurée de prérequis. L’API remplaçait alors une formation importée par un formulaire Selen et les prérequis par « Aucun prérequis ». Le formulaire pouvait également imposer la ressaisie des champs descriptifs du document importé.

La modification recharge maintenant ces propriétés. Le programme importé reste la référence et ses champs descriptifs restent facultatifs. Le formulaire propose « Aucun prérequis » ou « Prérequis obligatoires », avec ajout, modification et retrait des justificatifs. Les identifiants et descriptions sont conservés lors d’une modification ordinaire. Les déclarations incohérentes sont refusées avant envoi. Un ancien formulaire qui omet ces propriétés conserve les valeurs existantes ; un choix explicite « Aucun prérequis » retire la liste attendue.

## Candidatures déjà en cours

Le contrôle historique d’acceptation compte les justificatifs vérifiés. Il ne lie pas leur validation à une nouvelle déclaration de prérequis. La migration `20261003225500_guard_daily_prerequisite_edit.sql` empêche donc de changer cette déclaration tant qu’une candidature est en cours. Les autres informations de la formation restent modifiables. Sans candidature ouverte, les prérequis peuvent évoluer ; les décisions terminées et les preuves historiques restent intactes.

Le garde-fou est un trigger de base, avec verrou de formation, et s’applique également aux autres interfaces. La clé étrangère canonique des candidatures vers la formation et le statut non nullable ont été vérifiés sur le schéma réel. Il ne supprime ni ne réécrit aucune candidature, preuve ou décision. L’API expose le refus métier `PSE01` en 409 et garde la saisie ouverte sans confirmation de réussite.

Faire évoluer les prérequis d’une candidature déjà ouverte nécessitera un lot distinct de synchronisation et de nouvelle revue humaine. Cette livraison ne fabrique aucune revalidation à partir d’une ancienne preuve.

## Vérifications

- 23 tests sur l’API et les callbacks du formulaire réel ; 13 échouaient sur le main de départ.
- 12 tests PostgreSQL PGlite exécutent la migration : modifications permises, refus des changements avec candidatures ouvertes, isolation entre formations et conservation des preuves/décisions. Les cas SQL utilisent des données isolées locales.
- Les assertions existantes sont conservées ; le test d’assistance reçoit seulement la dépendance de politique partagée désormais utilisée par le formulaire.
- Contrôles locaux requis : suite complète 986 tests, TypeScript et compilation complète de 194 pages.
- La compilation locale utilise les certificats TLS système pour les polices ; aucune configuration produit ni dépendance n’est changée.
- Avant livraison : contrôle Lenovo du commit exact, preview READY, application et relecture de la migration non destructive, puis contrôle après fusion et production sur le SHA exact.

Aucun email réel, donnée de test en production, secret, Auth ou RLS n’est nécessaire. La recette authentifiée du parcours Avant reste ouverte. La sauvegarde programme/évaluation conserve deux appels et la protection globale contre une ancienne saisie reste un lot distinct.
