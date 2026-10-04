# Prévention des participants calculés persistés — 1 octobre 2026

La mission Lenovo existante `36779699044`, reprise après sa limite de quota, a livré le commit fonctionnel `a05120f2cb6ca9c83006be53dfacc186eb9dc03f` sur `fix/daily-session-derived-rows-20260930`.

Le GET marque uniquement les participants ajoutés depuis le registre d'inscriptions. Le formulaire et la normalisation serveur POST/PATCH retirent ces lignes calculées avant persistance, tout en conservant les participants historiques et les anciennes lignes portant un identifiant apprenant.

Work a revu les quatre fichiers modifiés et exécuté indépendamment les 19 tests de visibilité. Les vrais GET, POST et PATCH sont exercés avec des doubles stricts en mémoire : trois modifications successives, annulation, refus, abandon, retrait, historiques, déduplication, pagination et périmètre OF. Aucun email, accès Auth ou changement de données de production n'a été exécuté.

La validation Lenovo est passée. Ce document déclenche le contrôle post-push indépendant : tests, typecheck, build puis contrôles GitHub/Vercel seront vérifiés avant fusion.

La correction prévient les copies produites par les prochaines modifications. Elle n'efface aucune copie historique déjà persistée : ces données ne peuvent pas être distinguées sûrement d'un participant saisi manuellement.
