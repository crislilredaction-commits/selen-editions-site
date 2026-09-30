# Intégration du choix canonique de partie contractante

Le correctif fonctionnel provient du commit 7b0f1b25c06759e1ef891ea0fbf6e4802f6de589. Les onze fichiers hors package sont repris par leurs blobs Git exacts après comparaison avec leur base et le main actuel. Les workflows et les corrections Stripe étrangers à ce changement ne sont pas repris.

Le package conserve tous les scripts et garde-fous de main, dont npm test et npm run typecheck. Seul le garde-fou contrat/convention est étendu avec les tests existants de partie contractante.

La migration est additive, nullable et sans défaut ni reprise de données. Les deux prédicats CHECK ont été exécutés en PostgreSQL sur huit cas synthétiques par un SELECT sans écriture : historique NULL, particulier, entreprise avec commanditaire passent ; entreprise sans commanditaire, nom blanc et type invalide sont refusés. Ce contrôle d'expressions ne constitue pas encore un test d'insertion sur les contraintes appliquées. La base contient 23 inscriptions, la colonne est encore absente à cette préparation.

La migration doit être appliquée et son schéma vérifié avant le déploiement de ce code sur main. Aucun changement Auth/RLS, secret ou permission n'est inclus. Aucun email réel pendant les tests. Le contrôle Selen local check et Vercel du nouveau HEAD restent à valider avant fusion.
