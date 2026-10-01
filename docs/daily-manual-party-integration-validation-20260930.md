# Intégration du choix canonique de partie contractante

Le correctif fonctionnel provient du commit 7b0f1b25c06759e1ef891ea0fbf6e4802f6de589. Les onze fichiers hors package sont repris par leurs blobs Git exacts après comparaison avec leur base et le main actuel. Les workflows et les corrections Stripe étrangers à ce changement ne sont pas repris.

Le package conserve tous les scripts et garde-fous de main, dont npm test et npm run typecheck. Seul le garde-fou contrat/convention est étendu avec les tests existants de partie contractante.

La migration est additive, nullable et sans défaut ni reprise de données. Les deux prédicats CHECK ont été exécutés en PostgreSQL sur huit cas synthétiques par un SELECT sans écriture : historique NULL, particulier, entreprise avec commanditaire passent ; entreprise sans commanditaire, nom blanc et type invalide sont refusés. Ce contrôle d'expressions ne constitue pas encore un test d'insertion sur les contraintes appliquées. La base contient 23 inscriptions, la colonne est encore absente à cette préparation.

La migration doit être appliquée et son schéma vérifié avant le déploiement de ce code sur main. Aucun changement Auth/RLS, secret ou permission n'est inclus. Aucun email réel pendant les tests. Le contrôle Selen local check et Vercel du nouveau HEAD restent à valider avant fusion.

## Revue complémentaire des documents contractuels

La reprise initiale du correctif a passé Selen local check #33 (478 tests, typecheck et build) et une preview Vercel READY. Avant fusion, la revue a identifié les documents contractuels devenus inapplicables mais encore courants.

Les missions Lenovo 36775489734 puis 36776949599 ont livré les corrections sur la même branche et la même PR #285. Le dernier commit fonctionnel est 390be295d8ef6a5fe250899aa590540fe82f09e7. Le retrait des anciennes versions intervient après réussite des générations, avec bornes OF/session/types/IDs. Les documents signés conservent leur statut, leur contenu et leurs traces. Les tests exécutables couvrent les deux changements de type, les commanditaires, l’historique NULL et les échecs de lecture, génération, stockage ou retrait.

Work a reproduit un défaut de réessai (deux conventions courantes après un retrait échoué). Le test est désormais conservé dans la suite canonique, avec les variantes contrat et upload tardif ; un réessai réussi ne laisse qu’une version courante du document remplacé.

La validation extérieure Lenovo a exécuté 496 tests sans échec et un build complet réussi. Le typecheck Codex a retourné 0. Le build effectué dans le sandbox Codex ne pouvait pas télécharger les polices Google Fonts ; le build extérieur Lenovo a réellement réussi sans changer les polices ni les garde-fous. Vercel est READY sur 390be295.

À cette rédaction, la migration demeure non exécutée et le contrôle indépendant post-push doit encore être vérifié avant la fusion. Aucun test n’a utilisé un compte réel, un lien personnel ou un véritable envoi d’email.

## Schéma appliqué et vérifié

La migration additive a été appliquée une seule fois le 30 septembre 2026 et inscrite dans l’historique Supabase sous 20260930211806, nom daily_enrolment_contracting_party_type. Le fichier SQL du dépôt est renommé sur cette version réellement appliquée ; son contenu reste le blob canonique initial. Le test conserve ses assertions et lit le nouveau nom de fichier. Cette concordance évite de tenter ultérieurement une seconde application sous l’ancienne version de préparation.

La lecture du schéma confirme une colonne text nullable sans défaut et les deux contraintes CHECK validées. Les 23 inscriptions historiques restent présentes avec la nouvelle colonne NULL. Les indicateurs RLS, les droits et les définitions des politiques correspondent à la photographie précédant cette migration.

Selen local check #34 sur 48f9a3e a terminé avec succès : 496 tests, typecheck et build séparés. Le nouveau commit ne modifie que le nom du fichier de migration, sa référence dans le test et ce diagnostic ; son contrôle post-push et Vercel doivent être suivis avant fusion.
