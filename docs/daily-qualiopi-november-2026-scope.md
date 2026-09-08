# Daily — Référentiel Qualiopi applicable au 1er novembre 2026

Source de droit : décret n° 2026-728 du 1er août 2026, publié au Journal officiel du 4 août 2026. Entrée en vigueur : **1er novembre 2026**.

Source officielle : https://www.legifrance.gouv.fr/eli/decret/2026/8/1/2026-728/jo/texte

Ce document fixe le périmètre V1 à préserver dans Daily. Il ne présente pas ces exigences comme déjà applicables avant le 1er novembre 2026.

## Indicateurs prioritaires

| Indicateur | Périmètre officiel au 1er novembre 2026 | Évolution à couvrir dans Daily |
| --- | --- | --- |
| 12 | Formation, bilan de compétences, VAE, apprentissage | Ajouter à la prévention des ruptures la prévention et le traitement des violences, dont VSS, du harcèlement et des discriminations pendant la formation. |
| 19 | Formation, bilan de compétences, VAE, apprentissage | Conserver les ressources pédagogiques et leur appropriation ; prouver l'effectivité du suivi des modules à distance ; prévoir le référent pédagogique par formation seulement lorsque le seuil fixé par arrêté est applicable. |
| 27 | Formation, bilan de compétences, VAE, apprentissage | En cas de sous-traitance ou de portage salarial, contrôler la conformité au référentiel et tracer cette conformité dans les contrats. |
| 32 | Formation, bilan de compétences, VAE, apprentissage | Ajouter une analyse des risques sur la qualité des formations délivrées à la démarche d'amélioration continue issue des appréciations et réclamations. |
| 33 | **Apprentissage uniquement** | Mettre en place une évaluation des contenus et enseignements par les apprenants distincte de la satisfaction générale, partager les résultats avec les équipes pédagogiques, formaliser les améliorations et mesurer périodiquement leur efficacité. |

## Garde-fous d'implémentation

- Ne jamais généraliser l'indicateur 33 à tous les clients Daily : dans le tableau du décret, il est marqué uniquement dans la colonne `L. 6313-1-4°` correspondant aux actions de formation par apprentissage.
- Ne pas inventer le seuil de l'indicateur 19 : le décret renvoie à un arrêté ministériel. Tant que cette valeur n'est pas disponible dans une source officielle applicable, Daily doit conserver une règle paramétrable ou un état « seuil réglementaire à confirmer ».
- Ne pas transformer la date du 1er novembre 2026 en obligation anticipée : avant cette date, Daily peut préparer les preuves et procédures, mais doit distinguer préparation et exigence en vigueur.
- Les indicateurs 12, 19, 27 et 32 restent transversaux aux quatre catégories d'actions du tableau réglementaire.

La source canonique exploitable par le code est `lib/qualiopiNovember2026.ts`. Le garde `tests/dailyQualiopiNovember2026.test.mjs` verrouille notamment le périmètre spécifique de l'indicateur 33 et les principaux ajouts matériels du décret.
