# Email apprenant après acceptation OF — 2026-10-01

Branche : `fix/daily-acceptance-email-complete-20261001`.
HEAD de départ constaté : `93962e2a82b81000c1596b949811a58d1efb6689` (arbre propre).

## Modifications

- `lib/server/dailyAcceptanceEmail.ts` : destinataires du dossier (bénéficiaire ou participants entreprise avec alias et dédoublonnage), rendu HTML/texte commun, données OF/session, modalités et préformation. Contractualisation déterminée uniquement par l'inscription, sinon formulation neutre. Programme PDF lié uniquement selon les conditions du programme public Selen validé ; aucune pièce jointe.
- `lib/server/dailyLearnerPortalAccess.ts` : enrichissement du message canonique pour l'acceptation, vérification du dossier accepté, de l'OF, de la formation, de la session et du lien d'inscription. Sans inscription, notification d'acceptation sans token ni appel Auth. Messages manuels conservés.
- `lib/server/dailyLearnerEmailDelivery.ts` : réservation atomique par clé primaire déterministe dans `daily_communications`, clé d'idempotence Resend, preuve `sent` uniquement après ID fournisseur, horodatage et mise à jour réussie retournant une ligne. Un envoi explicitement rejeté peut être repris avec le même contenu. Les tentatives incertaines restent en attente sans réexpédition automatique (la fenêtre d'idempotence fournisseur est limitée).
- Route manager existante : notification également sans session ou après erreur de matérialisation, résultat d'envoi explicite sans annuler la décision. Relance existante réutilisée, périmètre de session vérifié avant matérialisation manuelle.
- Page Candidatures : résultats d'envoi après décision/matérialisation et bouton manager utilisant l'action existante `send_learner_access`.
- Tests : nouveaux comportements exécutant les vrais helpers et la route avec doubles locaux stricts ; adaptation du garde-fou d'idempotence à son nouveau module et du test d'échec Auth à la réservation de communication avant tentative. L'échec Auth interdit toujours tout envoi et toute annonce `sent`.

## Vérification

Aucun SDK Supabase/Auth/Resend réel dans les nouveaux tests. Les imports non autorisés échouent ; `buildDailyPortalAuthEntryUrl` est remplacé par un double et `fetch` interdit dans le contexte testé. Les données sont fictives.

Cas exercés : acceptation avec/sans session, matérialisation ultérieure, refus/en attente, périmètres incompatibles, destinataires individu/entreprise et alias, adresses absentes, isolation entre candidats, contrat/convention/NULL, même apprenant sur deux sessions, sources manuelles, modalités/horaires, HTML échappé et parité texte, PDF conditionnel, reprises concurrentes, erreurs fournisseur/Auth, absence d'ID, preuve non écrite ou mise à jour sans ligne, historique queued/sent incomplet.

- Tests ciblés : code 0.
- `npm test` : code 0, 78 fichiers réussis, 0 échec.
- `npm run typecheck` : code 0.
- `npm run build` : code 1. Tous les garde-fous préalables passent ; Turbopack échoue uniquement sur les téléchargements Google Fonts de `Cinzel`, `EB Garamond` et `Playfair Display` (connexion à `fonts.googleapis.com` indisponible dans le bac). Aucun contournement ajouté. Build complet à confirmer par Lenovo et le local check indépendant prévus.
- `git diff --check` : code 0.

Le shell initial ne trouvait pas `npm` (code 127). Les validations utilisent le Node déjà installé, via `PATH=/home/LilBarthaux/.nvm/versions/node/v24.20.0/bin:$PATH`.

Aucun changement de migration, Auth, RLS, signatures, cron, dépendances ou infrastructure. Aucun envoi réel ni accès aux données de production. Aucun commit/push/PR.

## Relecture et contrôle indépendant Work — 2026-10-01

Commit fonctionnel relu : `2bec064c32a6b215baa171910eae722eed315dc5`, comparé à `main` `93962e2a82b81000c1596b949811a58d1efb6689`.

- Les 9 fichiers modifiés correspondent au rendu, à la remise et au retour d'état des emails apprenants ; aucune migration ni modification du mécanisme Auth, des politiques RLS ou du workflow.
- Relecture de la réservation durable et de sa reprise conditionnelle : un email incertain ou sans preuve fournisseur ne devient pas `already_sent` et n'est pas automatiquement réexpédié. Une reprise après rejet certain conserve le même contenu et la même clé fournisseur.
- Les destinataires entreprise sont les bénéficiaires, jamais le contact commanditaire ; les inscriptions liées sont vérifiées dans le dossier, l'OF et la session concernés. Les choix contrat/convention proviennent de l'inscription, avec texte neutre pour les anciens dossiers sans choix.
- Exécution indépendante des vrais helpers et de la route avec doubles stricts : **65 tests ciblés réussis**, aucun échec et aucun envoi réel.
- Exécution indépendante de `npm test` : **574 tests réussis**, aucun échec. `git diff --check` : code 0.
- Le typecheck dans l'espace Work utilisant temporairement les dépendances Studio rencontre uniquement l'absence du module Stripe (7 erreurs TS2307 dans des fichiers inchangés). L'installation hors réseau depuis le verrou du site ne peut pas se terminer car un paquet n'est pas en cache. Cette vérification locale n'est donc pas annoncée verte ; le contrôle indépendant Lenovo doit fournir le résultat avec les dépendances exactes du site.
- Le **second essai du même Selen Codex mission #22** (run 36839323839, job 110378656577) a réussi : validation externe de 574 tests, compilation Next.js complète et fin `Validation passed`. Le problème de téléchargement des polices du premier bac n'y est plus présent. Aucune nouvelle mission doublonnée.
- Preview Vercel du commit fonctionnel : `dpl_GBhbe6iUQFK2JKntL9QqrszbrrE4`, état READY constaté.

Cette note déclenche le `Selen local check` post-push requis pour vérifier séparément tests, typecheck et build sur le HEAD final. La fusion et la vérification de production restent conditionnées à ces résultats.
