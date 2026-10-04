# A6 — notifications des tâches Studio

Le lot suit le critère révisé du cahier maître : routage vers l’agent affecté actif et joignable, secours administrateurs actifs, programme transmis à contrôler, lien Studio direct, absence de doublon et preuve d’envoi. La suppression de l’email lorsque l’agent est présent reste différée jusqu’à une présence canonique ; aucune date de connexion Auth n’est utilisée comme heuristique.

## Comportement

- Le périmètre est celui des abonnements Daily actifs et des organismes non archivés, selon la même correspondance abonnement/email que Studio. Une erreur de résolution ferme le traitement.
- Les checklists organisme/session sont resynchronisées par leurs RPC existantes. Les tâches terminées ou de phase future restent exclues. Le programme à contrôler ou l’original importé à compléter produit une notification stable vers sa fiche canonique, y compris avant toute session.
- L’affectation courante est relue. Un agent inactif, absent ou sans email utilisable donne le secours admin. Chaque destinataire distinct reçoit un envoi séparé.
- `daily_communications` réserve l’opération par clé primaire avant l’appel Resend. La clé représente OF, notification, signal métier et destinataire. Le contenu est conservé, la clé fournisseur reste stable et la confirmation exige identifiant fournisseur + date dans le bon périmètre.
- Une réservation `queued` dont l’issue est inconnue reste à contrôler sans relance automatique. Seul un refus certain permet une reprise. Un échec du marqueur `email_sent_at` se répare depuis la preuve sans renvoi. Un ancien marqueur sans preuve reste un historique incertain, jamais une permission de rejouer l’email.
- La file est parcourue par pages ; 100 anciennes lignes sans destinataire ne bloquent pas une suivante. Les compteurs distinguent traité, en attente, échec et ignoré. Le cron existant satisfaction conserve sa cadence ; A6 est ajouté chaque jour à 08:00 UTC, selon la précision permise par le forfait Vercel Hobby. Les emails ne sont donc pas immédiats : la cadence de dix minutes de l’ancienne PR a été refusée par Vercel avant création du déploiement. Une fréquence supérieure reste un choix d’infrastructure distinct ; aucun forfait, secret ou service supplémentaire n’est activé.

## Vérifications

41 cas exécutent la route, le périmètre, le sender et le moteur de livraison réels avec uniquement les frontières Supabase/Resend isolées ; aucune connexion ni email réel. Les 40 premiers cas reproduisent 33 échecs sur l’ancienne PR #273. Le cas supplémentaire vérifie le refus d’envoi lorsqu’une notification disparaît avant son routage. Deux cas PostgreSQL/PGlite exécutent la migration additive du marqueur, son idempotence et la conservation de l’historique. Les quatre garde-fous historiques A6 sont conservés avec la nouvelle preuve durable.

Suite locale complète : 1050/1050, aucun échec ni test ignoré ; TypeScript et compilation 195 pages réussis. Le schéma partagé possède déjà `notifications.email_sent_at` ; la migration déposée rend la dépendance explicite dans ce dépôt et ne remplit aucun historique. Aucun Auth, RLS, secret ou bucket modifié.

Complément Studio : la même tâche canonique reste visible aux administrateurs lorsqu’aucun agent n’est affecté ; les points organisme à relire/bloqués rejoignent Dashboard/Pilotage. La tâche n’est pas recréée par l’email. Les preuves de CI, fusion et production sont consignées dans le cahier maître après contrôle réel.
