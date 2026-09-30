# Validation du socle Avant formation — 30 septembre 2026

Branche : `fix/daily-before-validation-20260930`. Base effective (`git rev-parse HEAD`) : `23c5d3f291651e4743f7c8e20c25ecffdcdef802`, le main fourni dans la mission. Aucun commit ni push.

## Comparaison main / correctif

Comparaison par `git ls-tree HEAD` et `git hash-object` : les deux fichiers applicatifs sont strictement inchangés.

| Fichier | Blob main et correctif |
| --- | --- |
| `app/client/daily/formations/new/page.tsx` | `5ab24a50e45a5ab75ffd2cfca3f132c4aa43bb68` |
| `app/api/client/daily/quality-overview/route.ts` | `acfac1ad9995fc6c357840388f5283e05daf4424` |

Les anciens tests avaient pour blobs main `90c1b6401740841ae3cbf1972dc9dc94eb9a987a` (création) et `14404367936ac8239f540e02fca2cafa309b2927` (qualité). Seuls ces tests, leur chargeur isolé, deux scripts npm et ce diagnostic sont modifiés/ajoutés. Le script build et tous ses garde-fous restent identiques ; package-lock, workflows et code métier sont inchangés.

## Garanties ajoutées

Le chargeur transpile le vrai TS/TSX avec TypeScript installé puis l'exécute en contexte VM : tout import non explicitement simulé échoue, aucun transport réel n'est exposé.

- Création : activation des radios et callbacks réels, modes transmis à l'API, conservation de l'URL originale dans l'upload et le POST, refus sans original, champs descriptifs requis seulement en saisie Selen et valeurs transmises, navigation après succès. Pour chaque mode, prérequis indépendants, refus sans justificatif ou avec libellé blanc, transmission du justificatif obligatoire, effacement au retour à « aucun ». Le payload reste en brouillon avec résultats en attente ; l'avertissement de validation humaine est conservé. Le test existant `p0d-prerequisite-evidence.test.mjs` conserve les garanties structurelles séparant dépôt et vérification humaine. Ce harnais ne prétend pas simuler la validation HTML native ni un stockage distant.
- Qualité : exécution de GET/POST/PATCH avec doubles stricts des chaînes de requêtes. Vérification de category/title/observation, des cinq champs A3 et des autres champs métier, sans imposer l'ordre textuel du SELECT ; requalification difficulté/réclamation/action corrective, conservation de la provenance, portée organisation sur lectures et écritures, identité de l'auteur et états journalisés pour l'assistance Studio. Une entrée absente de l'organisation produit 404 sans écriture ni journal. Assertions structurelles de navigation et migration conservées.
- `npm test` exécute tous les `tests/*.test.mjs`, sans exclusion. `npm run typecheck` exécute `tsc --noEmit --incremental false`.

## Résultats effectifs

Node `v24.20.0` via `/home/LilBarthaux/.nvm/versions/node/v24.20.0/bin` ajouté au PATH. Chaque code de sortie est capturé séparément, sans dépendre du résultat agrégé de la fonction `validate` du runner.

1. Tests ciblés : code 0 ; exécution directe des fichiers : **5/5 création et 9/9 qualité**, aucun ignoré.
2. `npm test` : **code 1**, 73 fichiers exécutés, 72 réussis et 1 échoué selon le reporter. Seul `dailyManualEnrolmentSessionVisibility.test.mjs` échoue ; son exécution directe confirme **3 assertions en échec**. Log : `/tmp/daily-before-npm-test.log`.
3. `npm run typecheck` : **code 0**, aucune erreur. Log : `/tmp/daily-before-typecheck.log`.
4. `npm run build` : **code 1** après réussite de tous ses garde-fous. Next.js 16.1.6 / Turbopack échoue sur les téléchargements Google Fonts de `Cinzel`, `EB Garamond` et `Playfair Display` (`Failed to fetch`, connexion à `fonts.googleapis.com` impossible dans cet environnement réseau restreint). Log : `/tmp/daily-before-build.log`. Aucun remplacement de police, mock de build ou contournement du réseau ajouté.

Le build utilise exclusivement les valeurs externes factices retrouvées dans le script de validation du runner : `STRIPE_SECRET_KEY=sk_test_build_only`, `STRIPE_WEBHOOK_SECRET=whsec_build_only`, `NEXT_PUBLIC_SUPABASE_URL=https://build-only.invalid`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=build-only-placeholder`, `SUPABASE_SERVICE_ROLE_KEY=build-only-placeholder`. Aucun email ni appel métier live n'est effectué par les nouveaux tests.

## Blocage supplémentaire hors périmètre

Le test `dailyManualEnrolmentSessionVisibility.test.mjs` attend dans `app/api/client/daily/sessions/route.ts` une lecture de `daily_session_enrolments`, les statuts `declined/cancelled/abandoned` et un raccord par `learner_id/session_id`. La route GET retourne les sessions sans cette lecture ; la seule mention de `daily_session_enrolments` appartient à un garde-fou de suppression. Les trois premières assertions échouent respectivement sur la lecture, `declined` et `learner_id`.

Les blobs main et checkout sont identiques : test `535e85c04eff3d811f2d42badb7d5e27a22430d8`, route `d62ff3031715c8409f2bf5454fb8b562d53b5bb2`. Reproduction indépendante avec les deux fichiers extraits par `git show HEAD:<fichier>` dans `/tmp/daily-before-main` : **code 1, 0/3 réussis**, log `/tmp/daily-before-main-regression.log`. Ce défaut préexiste au correctif ; sa date d'introduction n'est pas déterminée ici.

Aucun test n'est supprimé, ignoré ou affaibli pour masquer ce blocage. La correction du raccord des inscriptions manuelles exigerait une modification métier explicitement exclue de cette mission. La validation complète reste donc en échec même si les autres commandes réussissent.

Contrôle final `git diff --check` : code 0. Deux blocages demeurent : raccord métier des inscriptions manuelles préexistant et accès réseau aux polices pendant le build. Aucune validation globale verte n’est revendiquée.
