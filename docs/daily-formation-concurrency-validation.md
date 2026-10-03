# Protection des modifications concurrentes de formation

Une ancienne saisie Daily pouvait remplacer les changements plus récents de l’OF ou de Studio. L’évaluation disposait de son contrôle de version depuis #277 ; le premier appel qui enregistre le programme restait sans protection.

Le formulaire capture désormais la date de mise à jour de la formation à son ouverture. L’API exige cette version, relit la formation dans son OF, puis protège l’écriture par son identifiant, son organisme, son statut courant et sa date de mise à jour. Un archivage ou une modification entre la lecture et l’écriture produit un 409. Aucune réussite ni action d’assistance n’est enregistrée si aucune ligne ne correspond. Une version absente ou invalide exige de recharger le catalogue.

Après un premier enregistrement réussi, le formulaire conserve uniquement la nouvelle date renvoyée par l’API. Si l’évaluation échoue, le réessai utilise cette version. Si le résultat réseau du programme est inconnu, aucune date n’est inventée : un réessai sur l’ancienne version sera refusé si l’écriture a réellement eu lieu. Les erreurs conservent la saisie et n’affichent pas de fausse confirmation.

## Vérifications

- 17 nouveaux cas exécutent l’API et les callbacks réels ; 16 échouaient avec le code de #297 avant cette correction.
- Cas couverts : versions manquantes/invalides, modification antérieure, concurrence pendant l’écriture, archivage, retour Studio, déplacement de périmètre, suppression, conservation de la version/lien/historique, reprise d’évaluation et résultat réseau inconnu.
- Les fixtures existantes portent la date de mise à jour non nullable du schéma réel ; leur modèle applique aussi le changement de date sur une écriture, comme le trigger PostgreSQL. Les anciennes assertions restent conservées.
- Suite locale complète : 1003/1003, aucun échec ni test ignoré ; TypeScript et compilation complète de 194 pages réussis.
- Contrôles de livraison : Lenovo du SHA exact, preview READY, fusion sûre, puis Lenovo et production du SHA de fusion. Aucun nouveau schéma, Auth, RLS, secret, email ou donnée de test en production.

La sauvegarde programme/évaluation conserve deux appels ; un programme déjà enregistré peut donc rester présent si l’évaluation échoue. Cette livraison protège leurs versions et la reprise, sans transaction globale entre ces appels. La recette authentifiée du parcours Avant et les autres écarts du cahier restent ouverts.
