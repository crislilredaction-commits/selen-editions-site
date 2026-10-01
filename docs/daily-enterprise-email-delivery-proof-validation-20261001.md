# Preuve de livraison des accès entreprise — 1er octobre 2026

## État initial constaté

Branche : `fix/daily-enterprise-email-delivery-proof-20261001`.
HEAD : `1664b2134ac19a7d6a323de1efee4e01d59f8077`, conforme à la base annoncée contenant #287 et #288. Worktree initial propre. Aucun commit, push ou PR effectué.

## Correction et fichiers

- `lib/server/dailyEnterprisePortalAccess.ts` : utilisation de la réservation durable existante, clé déterministe séparée par type entreprise, OF, session, contact et accès. L'historique exige `sent`/`delivered`, `provider_message_id` et `sent_at` pour retourner `already_sent`. Un historique incomplet, y compris les anciens échecs sans clé fournisseur connue, reste `pending`, sans réexpédition ni reclassification.
- `lib/server/dailyLearnerEmailDelivery.ts` : extraction du calcul d'identifiant sans changer les clés apprenants ; sujet de préparation configurable ; option entreprise renvoyant `pending` sur erreur fournisseur ambiguë ; exception pendant l'écriture de preuve traitée comme incertaine. La réservation par clé primaire, la reprise conditionnelle `failed → queued`, la sauvegarde et la réutilisation du message, ainsi que la clé Resend stable sont conservées. `sent` exige un ID fournisseur et une écriture de preuve sans erreur avec une ligne retournée.
- `tests/dailyEnterpriseEmailDelivery.test.mjs` : 32 tests comportementaux du vrai helper, du parcours de matérialisation accepté et de l'envoi aux contacts des sociétés de session.
- `tests/helpers/dailyAcceptanceHarness.mjs` : extension du banc mémoire existant pour charger explicitement le vrai module entreprise, simuler l'absence du fournisseur et une exception d'écriture de preuve. Tables autorisées et mutations contrôlées ; seule la synchronisation de sociétés déjà présente dans le helper est autorisée en plus pour ce parcours. Imports non autorisés et réseau refusés ; SDK Resend simulé ; aucun email réel, aucun SDK Auth réel.
- `tests/dailyEnterprisePortalAccess.test.mjs` : assertions de source relocalisées vers le module de livraison partagé, sans retirer les garanties, appuyées par les tests comportementaux.
- Ce document : résultats et limites de validation.

La création, la rotation, le renouvellement et la validation des tokens sont inchangés. Les emails, URLs canoniques, destinataires, métadonnées, droits, documents, Auth, synchronisation des participants et workflows sont inchangés. Les consommateurs des résultats entreprise dans les routes sessions et demandes d'inscription transmettent les statuts sans conversion en succès d'envoi ; aucun consommateur UI de `enterprise_access` n'a été trouvé. Le type expose désormais `pending`.

## Résultats constatés

Node disponible via `/home/LilBarthaux/.nvm/versions/node/v24.20.0/bin` ajouté au PATH des commandes ; dépendances déjà présentes.

- `npm test` : succès, 80 fichiers réussis. Dans ce bac, le rapport avec isolation compte les fichiers ; ce nombre n'est pas présenté comme le nombre de tests individuels.
- Exécution complémentaire `node --test --test-isolation=none tests/*.test.mjs` : **615 tests, 615 réussis, 0 échec, 0 ignoré**.
- `npm run typecheck` : succès, code 0.
- `npm run build` : tous les garde-fous préalables passent ; Next/Turbopack échoue au téléchargement Google Fonts de **Cinzel**, **EB Garamond** et **Playfair Display** (connexion impossible dans le bac). Le build complet n’est donc pas validé ici. Aucune police ni configuration n’a été modifiée pour masquer cet échec.
- `git diff --check`, après le build et après rédaction du rapport : succès, code 0.
- Acceptation et accès apprenant : **65/65**, via les deux fichiers `dailyAcceptanceEmail.test.mjs` et `dailyLearnerPortalAccess.test.mjs` sans isolation.
- Livraison entreprise : **32/32** ; garde-fous entreprise : **11/11** ; participants fantômes (`dailyManualEnrolmentSessionVisibility.test.mjs`) : **19/19** ; lien stable : **15/15**. Exécution ciblée commune : **77/77**.

Les tests couvrent les preuves complètes/incomplètes, queued, rejet certain, transport incertain, erreur fournisseur ambiguë, ID absent, erreur/absence de ligne/exception d'écriture de preuve, reprises sans doublon, concurrence initiale et de reprise, séparation des clés, absence d'adresse/session/fournisseur, session archivée, création/réutilisation d'accès, conservation de la décision acceptée, de la session et de l'inscription.

## Contrôles externes obligatoires

Le build externe Lenovo et le workflow indépendant **Selen local check** restent obligatoires sur le résultat final repris par le workflow. Ils ne sont pas attestés par les tests du bac. Le local check checkout une ref publiée ; le worktree non commité de cette intervention n'y est pas disponible. Aucun déclenchement sur l'ancien HEAD n'est présenté comme une validation de cette correction. Aucun workflow n'a été modifié.

## Relecture et validation indépendante Work

- Commit fonctionnel relu : `5b38121c9d8e2a06ea77ca2c6ec83f105f623553`, comparé au main `1664b2134ac19a7d6a323de1efee4e01d59f8077` livré après #288.
- Les trois défauts ont été reproduits avant correction dans le vrai helper avec doubles stricts : ancien `queued → already_sent`, réponse fournisseur sans ID annoncée `sent`, écriture de preuve en erreur annoncée `sent`. Aucun email réel ni mutation de token pendant cette reproduction.
- Relecture de la réservation et des clés séparées entreprise/apprenant, du traitement conservateur de l'historique sans clé stable et des reprises concurrentes. Les instructions de création et renouvellement d'accès, URLs, périmètres et destinataires restent identiques ; le calcul des identifiants apprenants garde exactement le même algorithme.
- Les adaptations du banc d'essai autorisent uniquement les colonnes `companies,updated_at` de la synchronisation de session existante dans les scénarios entreprise. Les SDK, tables et mutations inattendus restent interdits.
- Exécution indépendante des six fichiers ciblés : **142 tests réussis**, aucun échec (32 livraison entreprise, 11 garde-fous entreprise, 65 acceptation/accès apprenant, 19 participants dérivés, 15 liens stables). Aucun SDK Auth/Resend réel ni aucun envoi client.
- `git diff --check` entre base et correction : code 0.
- **Selen Codex mission #24** (run 36914200702, job 110544025117) réussi au premier passage externe : **621 tests réussis** dans le runner avec isolation, aucun échec, compilation Next.js complète puis `Validation passed`. Ce nombre provient du contrôle externe ; le nombre 615 ci-dessus concerne l'exécution supplémentaire sans isolation dans le bac et ne remplace pas le contrôle externe.

Cette note déclenche le local check post-push indépendant sur le HEAD final. Tests, typecheck, build, contrôles GitHub et preview Vercel doivent être verts avant fusion ; main et production seront ensuite vérifiés.
