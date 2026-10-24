# Architecture — Selen Vitrine

## Responsabilités de Selen Vitrine
Selen Vitrine (`selen-site`) rassemble :
1. **Le site public** : présentation des prestations Selen Editions, articles, CGV/CGU, prise de rendez-vous Calendly et formulaires de contact.
2. **Les parcours d'achat** : paiements Stripe pour le préaudit Qualiopi, l'auto-audit, l'audit blanc et Selen Daily.
3. **L'espace client & organismes de formation** : gestion des dossiers NDA/Qualiopi, création de formations/sessions, génération de documents réglementaires, suivi des émémargements, évaluations et indicateurs.
4. **Les portails d'accès tiers** : portails sécurisés apprenants, formateurs et entreprises.

*Remarque :* L'ensemble des fonctionnalités agent/admin avancées appartient au dépôt **Selen Studio**. Selen Vitrine redirige les connexions agent vers Selen Studio via `NEXT_PUBLIC_STUDIO_URL`.

## Arborescence du Projet
- `app/` : Routes App Router Next.js (pages publiques, espace `/client`, routes `/daily/portail`, endpoints `/api`).
- `components/` : Composants UI réutilisables (navigation, cartes, éditeurs, bannière d'assistance, univers graphique Selen).
- `lib/` : Logique métier, utilitaires clients/serveur (`lib/server/` pour le code à privilèges et `lib/daily/` pour les schémas métier).
- `supabase/` : Migrations SQL pour le schéma de données Supabase.
- `tests/` : Tests unitaires et d'intégration natifs Node.js (`node --test tests/*.test.mjs`).

## Authentification & Sécurité
- Authentification gérée par Supabase Auth avec garde de session côté serveur (`lib/server/clientNdaAccess.ts`, `proxy.ts`).
- Contrôle d'accès strict par organisation et rôle sur l'ensemble des routes API et portails.
