AI_CONTEXT — Selen Vitrine
Rôle du projet
Ce dépôt correspond à Selen Vitrine.
Selen Vitrine contient :

le site public Selen Editions ;
les pages de présentation des offres ;
les pages de paiement ;
l’espace client ;
les parcours client liés à l’auto-audit Qualiopi, au préaudit et à l’audit blanc.

Selen Vitrine ne doit pas contenir l’espace agent/admin complet.
Séparation des projets
La séparation validée est la suivante :

Selen Vitrine = site public + espace client.
Selen Studio = espace agent/admin.
Sélion = robot/prospection, actuellement en pause.

Toute fonctionnalité agent/admin complète doit être développée dans Selen Studio, pas dans ce dépôt.
Dans Selen Vitrine, les liens “Espace agent” doivent rediriger vers Studio via la variable :
NEXT_PUBLIC_STUDIO_URL

avec fallback possible vers :
https://studio.selen-editions.fr/

Stack technique
Projet Next.js avec App Router.
Technologies principales :

Next.js
TypeScript
Supabase
Stripe
Calendly
Tailwind / styles existants
Vercel pour le déploiement

Avant toute modification importante, vérifier :

l’architecture existante ;
les routes déjà présentes ;
les appels Supabase déjà utilisés ;
les variables d’environnement déjà existantes.

Règles de prudence
Ne pas modifier plusieurs parcours en même temps.
Ne pas toucher aux routes Stripe, Supabase ou webhook sans nécessité explicite.
Ne pas renommer les tables Supabase sans vérifier leur usage.
Ne pas modifier l’authentification client sans analyser les conséquences.
Ne pas créer de nouveau projet Supabase.
Ne pas déplacer de logique agent/admin dans Selen Vitrine.
Ne pas supprimer une page ou une route sans vérifier si elle est utilisée par :

le site public ;
un lien client ;
Stripe ;
Calendly ;
un email automatique ;
Vercel ;
Supabase.

Parcours client importants
Auto-audit Qualiopi / préaudit
Le client accède au préaudit depuis l’espace client.
L’accès au préaudit repose sur la table :
selen_client_tool_access

Le préaudit utilise le tool slug :
preaudit-qualiopi

L’accès peut être :

limité dans le temps ;
illimité.

La fonction de vérification d’accès se trouve dans :
app/lib/checkPreauditAccess.ts

Le questionnaire profil préaudit se trouve dans :
app/client/preaudit/page.tsx

La suite du préaudit se trouve notamment dans :

app/client/preaudit/marques
app/client/preaudit/[number]
app/client/preaudit/final

Audit blanc / Selen Review
L’audit blanc côté client se trouve dans :
app/client/audit-blanc/page.tsx

La réservation Calendly principale utilise :
NEXT_PUBLIC_CALENDLY_AUDIT_BLANC_3H30_URL

Si l’audit blanc se fait en deux rendez-vous, le second rendez-vous est fixé avec l’auditeur pendant ou après la première session.
Design
Respecter l’univers graphique Selen :

parchemin ;
brun / sépia ;
doré ;
ton élégant, ancien registre, grimoire moderne ;
côté client plutôt clair ;
côté agent plutôt sombre, mais agent/admin appartient surtout à Selen Studio.

Ne pas remplacer le design global par un style générique SaaS bleu/blanc.
Méthode de travail avec Codex
Avant de coder, toujours :

Lire ce fichier.
Identifier les fichiers concernés.
Expliquer brièvement le plan.
Modifier uniquement les fichiers nécessaires.
Lister les fichiers modifiés.
Indiquer les tests à faire.

Pour une tâche importante, commencer par proposer un plan sans modifier le code.
Commandes utiles
Vérifier l’état Git :
git status

Voir les modifications :
git --no-pager diff --stat
git --no-pager diff

Lancer le build :
npm run build

Après validation :
git add .
git commit -m "Message clair"
git push origin main

Règle importante
Avant d’utiliser Codex pour modifier le projet, le working tree doit être propre :
nothing to commit, working tree clean

Si des fichiers sont déjà modifiés, ne pas lancer de nouvelle tâche Codex avant d’avoir compris, validé ou sauvegardé ces modifications.
