# Gazette Selen : gouvernance éditoriale de l'IA

## Principes
- **Aucune publication automatique d'article** : le statut reste `draft` jusqu'à l'accord explicite d'une personne habilitée.
- L'assistance de l'IA doit être annoncée clairement au public, par choix de transparence de Selen Éditions, indépendamment des exceptions juridiques applicables.
- Le contrôle éditorial doit être **substantiel** : faits, citations, textes officiels, dates, sources, interprétations, conseils pratiques, confidentialité, représentations trompeuses et plagiat.
- Une IA ne peut pas se désigner comme « validateur humain ».
- Ne jamais qualifier une validation orthographique ou un simple clic de contrôle éditorial substantiel.

## Chaîne d'états préconisée
1. `draft` : contenu IA proposé, non publié.
2. `review_requested` : attente de contrôle de fond par une personne (à implémenter si la base ne le supporte pas).
3. `changes_requested` : corrections nécessaires (à implémenter).
4. `approved` : version finale et validation humaine tracées (à implémenter).
5. `published` : diffusion seulement si validation de la même version et accord de publication.
Les états 2–4 sont **des spécifications cibles**, pas des statuts disponibles actuellement dans la table `articles`. Ne pas les introduire sans migration, tests et contrôle des autorisations.

## Preuve de validation (cible)
Conserver : identifiant de l'article, empreinte ou numéro de version du contenu, personne validatrice, date, sources vérifiées, corrections importantes, décision finale. Une modification après validation doit demander un nouveau contrôle.

## Mention publique après validation effective
« Cet article a été préparé avec l'assistance d'une intelligence artificielle. Son contenu a été vérifié sur le fond et sa publication validée sous la responsabilité éditoriale de Selen Éditions. »

## Mention avant validation
« Brouillon préparé avec une intelligence artificielle, en attente de contrôle et de validation humains. »

## Fiches de veille
Le circuit client existant est la table Supabase `public.daily_watch_entries` dans Selen Studio. Elle ne possède que `active` ou `archived` : **aucun statut de brouillon**. Tant que la relecture humaine n'est pas constatée, conserver les fiches en brouillon hors de cette table, avec leurs sources, et ne pas les diffuser. Ne jamais utiliser `archived` pour simuler un brouillon sans vérification de tous les consommateurs.

## Références
Article 50 AI Act : https://ai-act-service-desk.ec.europa.eu/fr/ai-act/article-50
Lignes directrices Commission 20 juillet 2026 : https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems
