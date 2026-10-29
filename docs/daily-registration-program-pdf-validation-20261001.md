# Validation du programme PDF depuis la candidature

La route de téléchargement et le bouton concernent les programmes Selen validés, dans le contexte du lien public de formation ou de session. Un programme importé conserve son document d’origine et ne propose pas de PDF structuré incomplet. La lecture des données publiques transmet effectivement le mode de création et les objectifs pédagogiques.

## Revue et vérification indépendantes — 1 octobre 2026

- Révision fonctionnelle : `440d6aa62fdfc79c3fd61e9780e26bb237792d90`.
- Diff limité au téléchargement du programme, aux champs publics nécessaires, à son affichage et aux tests ; aucune migration, modification Auth/RLS ou émission d’email.
- 34 tests ciblés exécutés indépendamment, tous réussis. Les tests exercent les routes GET, les contextes de jeton, les erreurs de lecture, les relations objet/tableau, le statut de validation et le masquage des programmes importés. Les garde-fous existants sont conservés.
- Fixture fictive, sans SDK connecté : même programme de 500 séquences avant et après. L’ancien PDF affichait 24 séquences sur 2 pages et perdait la fin du contenu. Le PDF corrigé contient les 500 séquences distinctes sur 10 pages, la dernière sentinelle, les deux objectifs pédagogiques et les coordonnées.
- Extraction Poppler et contrôle des coordonnées avec pdfplumber : aucun caractère hors des marges de page. Pages initiales et dernière page rendues et inspectées visuellement.
- Le PDF ne comprend que les champs officiels du programme ; aucune donnée privée de candidat ni note interne.
- Contrôle local du bac Codex : tests et typecheck réussis ; build interne empêché par le téléchargement de Google Fonts. La validation externe Lenovo du workflow a compilé avec succès. Un nouveau contrôle GitHub indépendant `Selen local check` doit valider tests, typecheck et build sur la révision exacte avant fusion.

## Limites de livraison

Cette correction porte sur le dossier public de candidature. Elle n’ajoute pas de route privée dans l’espace apprenant, ni de diffusion publique des documents importés privés. La disponibilité dans l’espace apprenant reste à valider séparément avec son périmètre d’accès existant.
