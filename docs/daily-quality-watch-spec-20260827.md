# Selen Daily — Suivi Qualité et tableau de veille

Décisions de recette validées le 27 août 2026.

## 1. Positionnement du module Qualité

Le module Suivi Qualité ne doit pas se limiter à un interrupteur d'activation. Il devient un espace de pilotage regroupant :

- procédures internes ;
- satisfaction des apprenants, formateurs et entreprises/commanditaires ;
- incidents, difficultés et réclamations ;
- actions correctives et améliorations ;
- veille professionnelle et traçabilité de son exploitation.

Pour un organisme déclaré Qualiopi, le module reste obligatoire et ne peut pas être désactivé. Pour les autres organismes, il reste optionnel.

## 2. Tableau de veille

Créer un tableau de veille par organisme avec trois familles :

1. veille réglementaire sur le champ de la formation professionnelle ;
2. veille pédagogique et technologique ;
3. veille métier.

### 2.1 Veille réglementaire et veille pédagogique/technologique

Ces deux veilles sont alimentées par Selen à partir des contenus publiés sur le blog Selen.

Chaque entrée commune doit au minimum contenir :

- titre de l'article ;
- lien vers l'article du blog ;
- type de veille ;
- date de publication / mise à disposition ;
- statut actif/archivé de l'entrée commune.

Les entrées communes sont visibles dans le tableau de chaque client Daily concerné sans duplication manuelle du contenu.

Pour chaque organisme, l'utilisateur peut :

- cocher « Ça m'intéresse » ;
- conserver la date exacte à laquelle cette case a été cochée ;
- renseigner ce que cette veille lui a permis d'améliorer ;
- modifier/compléter son commentaire d'amélioration en conservant une traçabilité minimale des changements utiles à l'audit.

Le tableau doit donc distinguer les données communes Selen de l'exploitation propre à chaque organisme.

### 2.2 Veille métier

La veille métier est propre à chaque organisme et ne peut pas être remplie de manière pertinente par Selen à sa place.

Le client doit pouvoir créer une entrée avec au minimum :

- date ;
- titre / sujet de la veille ;
- source ou lien ;
- description courte ;
- intérêt pour l'activité ;
- amélioration ou décision éventuellement mise en œuvre.

Une tâche « Compléter ma veille métier » doit être générée une fois par mois dans le tableau de bord Daily.

Règles de la tâche :

- une seule tâche active pour le mois courant ;
- la tâche est considérée terminée dès qu'au moins une entrée de veille métier est créée ou explicitement validée pour le mois ;
- elle réapparaît le mois suivant ;
- son historique doit permettre de démontrer la régularité de la veille en audit.

## 3. Exploitation des veilles communes par les clients

Pour chaque entrée réglementaire ou pédagogique/technologique commune, stocker par organisme :

- `interested` / « Ça m'intéresse » ;
- date `interested_at` ;
- texte libre `improvement_note` ;
- date de dernière modification ;
- auteur de la dernière modification lorsque cette information est disponible.

Une entrée non cochée reste visible dans la veille commune mais ne doit pas être présentée comme une veille exploitée par l'organisme.

## 4. Actions globales imposées depuis Studio

Lorsqu'une évolution repérée par Selen entraîne une amélioration effectivement mise en œuvre pour tous les clients Daily, Studio doit permettre à un agent autorisé de forcer l'exploitation de l'entrée pour les organismes concernés.

Cette action Studio doit pouvoir :

- forcer la case « Ça m'intéresse » à vrai ;
- définir la date d'intérêt ;
- renseigner automatiquement l'amélioration réalisée ;
- indiquer que l'exploitation a été imposée par Selen/Studio et non cochée manuellement par le client ;
- conserver l'auteur Studio et la date de l'action ;
- appliquer l'opération à tous les clients Daily ou à une sélection d'organismes lorsque nécessaire.

Le client voit ensuite l'entrée dans son tableau avec l'amélioration apportée, mais l'origine Studio doit rester traçable.

## 5. Modèle de données recommandé

Séparer les données communes et les données organisme :

### `daily_watch_entries`

Catalogue commun Selen :

- id ;
- type : `regulatory`, `pedagogy_technology` ;
- title ;
- article_url ;
- published_at ;
- status ;
- created_at / updated_at.

### `daily_organisation_watch_entries`

Exploitation d'une entrée commune par un organisme :

- organisation_id ;
- watch_entry_id ;
- interested ;
- interested_at ;
- improvement_note ;
- forced_by_studio ;
- forced_by_agent_profile_id ;
- forced_at ;
- created_at / updated_at.

### `daily_business_watch_entries`

Veille métier propre à l'organisme :

- organisation_id ;
- watch_date ;
- title ;
- source_url ;
- description ;
- interest_note ;
- improvement_note ;
- created_by ;
- created_at / updated_at.

## 6. Affichage attendu dans Daily

Le Suivi Qualité doit proposer au minimum deux grands espaces :

- **Pilotage qualité** : procédures, satisfactions, incidents, réclamations, solutions et améliorations ;
- **Mes veilles** : tableau filtrable par type, date, intérêt et exploitation.

Dans « Mes veilles », chaque ligne réglementaire ou pédagogique/technologique affiche :

- type ;
- titre cliquable ;
- date ;
- case « Ça m'intéresse » ;
- date de sélection ;
- champ « Ce que j'ai amélioré » ;
- indicateur lorsque l'amélioration a été enregistrée automatiquement par Selen.

La veille métier dispose en plus d'un bouton d'ajout manuel et d'un rappel mensuel dans « À faire ».

## 7. Studio

Studio doit disposer d'une vue qualité par client permettant :

- consultation de toutes les veilles ;
- consultation de l'exploitation faite par le client ;
- ajout/correction d'une amélioration ;
- action globale sur une veille commune ;
- filtrage des organismes n'ayant pas encore exploité une veille jugée importante ;
- traçabilité de toute intervention agent.

Cette vue devra être reliée au tableau qualité global du client et non constituer un second système parallèle.