# Évaluation intégrée en assistance Studio

Le formulaire de formation pouvait enregistrer son programme puis refuser l’évaluation finale avec « L’assistance agent est en lecture seule ». La PR #277 existante est reprise sur le main courant, en conservant ses contributions et toutes les assertions de recette ajoutées depuis.

L’API d’évaluation utilise le contexte d’assistance canonique déjà autorisé pour les écritures métier. L’OF vient de ce contexte ; l’identifiant demandé ne peut pas étendre son périmètre. Une formation absente, archivée ou appartenant à un autre OF n’est pas modifiable. Les jetons falsifiés, expirés ou révoqués et les acteurs inactifs restent refusés par les services existants.

Le formulaire transmet `updated_at` reçu après la sauvegarde du programme. L’API exige cette version, lit la formation dans l’OF autorisé et conditionne l’écriture à l’OF, au statut et au même horodatage. Un questionnaire plus récent, une validation ou un archivage concurrent produisent un conflit sans modification d’évaluation ni journal de réussite. Modifier une évaluation validée ou à corriger renvoie la formation en revue, avec le signal canonique, sans changer sa version, son lien d’inscription ou son historique.

Après une écriture réellement effectuée, l’action d’assistance est journalisée par le service existant avec l’acteur et l’OF. Les doubles soumissions du formulaire sont bloquées ; la saisie reste accessible après une erreur réseau. Un conflit ne montre aucune confirmation de réussite.

## Vérifications

- 33 nouveaux tests exécutent la vraie route, les services de contexte/assistance et les callbacks du vrai formulaire avec Supabase et réseau isolés. Le cas d’assistance échoue sur main avant reprise. Avec l’ancienne PR remise à niveau, 19 de ces 33 cas échouent avant les corrections complémentaires.
- Les assertions existantes sont conservées, y compris les créations, le contenu détaillé, la modification sans doublon et le PDF du programme.
- Suite complète : 951 tests réussis, aucun échec ni test ignoré ; typecheck et build complet réussis. Le build local utilise les certificats TLS système pour le téléchargement réel des polices Google ; aucune police ni configuration du produit n’est modifiée. Les contrôles Lenovo et la production restent obligatoires avant livraison.
- Schéma et triggers réels consultés en lecture seule : `updated_at`, `status` et `organisation_id` sont non nullables ; le trigger d’horodatage existe. Aucun changement de schéma, Auth/RLS, rôle, secret ou donnée de production ; aucun email réel pendant les tests.

## Limites de recette

La sauvegarde du programme et celle de l’évaluation conservent leurs deux requêtes existantes. Ce lot protège l’évaluation ; il ne déclare pas atomique tout le formulaire ni protégée toute écriture du programme contre un ancien écran. La recette authentifiée Daily/Studio/apprenant reste requise et le parcours Avant formation reste ouvert. Pendant/Après restent différés.
