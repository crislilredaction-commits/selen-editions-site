# Validation des accès apprenants — 30 septembre 2026

Source fonctionnelle : `5be957ffd74b22afcc8c64f31fba7e29e61a7a6b`. PR existante : #283.

Le run Selen Codex mission #17, tentative 1, a été interrompu par le quota avant toute modification. La tentative 2 a réussi et le commit est présent sur la branche cible.

## Vérifications effectives

- `npm test` : 468 tests réussis, zéro échec, aucun test ignoré.
- `npm run typecheck` : code 0 dans le diagnostic Codex.
- Build dans le sandbox Codex : échec de récupération des trois polices Google Fonts. Le build du shell de validation Lenovo a ensuite compilé et terminé avec succès, avec les variables externes factices du workflow.
- Les six tests de `activationHandlers.test.mjs` exécutent le composant TSX et ses callbacks avec hooks, SDK, navigation et timers simulés. Ils couvrent l'absence de consommation au montage, le nouvel essai après 429/5xx, les exceptions, l'expiration définitive, le refus puis l'acceptation du mot de passe, et la destination filtrée.
- Les tests du helper reproduisent la règle officielle de `adminGenerateLink` : invitation autorisée pour un compte existant non confirmé ; récupération pour un compte confirmé ; propagation d'un échec fournisseur avant tout envoi ou annonce d'envoi.
- La consommation unique, les contrôles de mot de passe et les autorisations du portail sont conservés. Aucun email réel ni appel Auth live n'a été effectué par les tests.

Ce commit documentaire déclenche le contrôle post-push Selen local check sur le code relu. La fusion dépend de son résultat réel et de la validation Vercel du même HEAD. La validation technique ne prouve pas encore que chaque apprenant a pu se connecter.
