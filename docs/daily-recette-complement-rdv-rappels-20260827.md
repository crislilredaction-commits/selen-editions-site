# Selen Daily V1 — Complément de recette du 27 août 2026

Ce document complète le cahier des charges Daily et les corrections de recette déjà consignées le 27 août 2026. Ces règles sont à considérer comme validées.

## Paramétrage accompagné — préparation du rendez-vous

Lors de la prise de rendez-vous pour un paramétrage accompagné, informer clairement le client qu'il doit préparer les documents utiles au rendez-vous afin que le paramétrage puisse être réalisé efficacement pendant la visio.

Documents à préparer :

- avis de situation INSEE ;
- dernier BPF s'il en possède un ;
- CV du ou des formateurs ;
- programme de la ou des formations à paramétrer ;
- certificat Qualiopi si l'organisme est certifié.

Cette liste doit être affichée directement dans le parcours de réservation, avant confirmation définitive du rendez-vous.

Le mail de confirmation du rendez-vous doit reprendre la même liste de documents à préparer, ainsi que les informations habituelles du rendez-vous et le lien de visioconférence.

Le BPF et le certificat Qualiopi restent conditionnels : ne pas les présenter comme obligatoires lorsque le client n'en possède pas ou n'est pas concerné.

## Préférences de rappel des tâches Daily

Pendant le paramétrage initial, demander au client comment il souhaite recevoir les rappels concernant les tâches Daily qui requièrent son intervention.

Deux modes doivent être proposés :

### 1. Rappel immédiat / au fil de l'eau

- lorsqu'une nouvelle tâche nécessitant l'intervention du client est créée, une notification lui est envoyée ;
- le canal externe prévu est l'email ;
- l'interface Daily continue également d'afficher la tâche dans la zone « À faire » ;
- éviter les doublons pour une même tâche non modifiée ;
- une tâche déjà clôturée ne doit plus générer de rappel.

### 2. Récapitulatif quotidien

- un seul rappel est envoyé chaque jour à 7 h, heure de Paris ;
- il regroupe uniquement les tâches encore ouvertes et nécessitant réellement l'intervention du client ;
- aucune notification immédiate n'est envoyée à chaque nouvelle tâche dans ce mode ;
- si aucune tâche n'est en cours, ne pas envoyer d'email vide.

La préférence choisie doit être conservée au niveau de l'organisme Daily et rester modifiable ultérieurement depuis le profil / les préférences du compte, sans repasser par le paramétrage initial.

## Règles communes aux rappels

- une tâche doit correspondre à une action réellement attendue du client ;
- les informations purement informatives ne doivent pas déclencher de rappel ;
- les rappels doivent pointer directement vers l'écran où l'action peut être réalisée ;
- les tâches documentaires doivent pointer vers « Mon profil & mon organisme » lorsqu'elles concernent des pièces administratives de l'OF ;
- la clôture, validation ou disparition de la condition qui a créé la tâche doit arrêter automatiquement les rappels ;
- conserver une trace technique suffisante des notifications envoyées afin d'éviter les doubles envois et de diagnostiquer les incidents.

## Reprise de recette et déploiements

À compter du 28 août 2026, reprendre les corrections Daily et Studio déjà demandées, en tenant compte de la limite quotidienne de déploiements Vercel. Avant de considérer une correction comme terminée, vérifier successivement :

1. le composant ou la route réellement utilisés ;
2. le commit présent sur `main` ;
3. la création du déploiement Vercel correspondant ;
4. l'état `READY` du déploiement production ;
5. lorsque possible, le rendu ou le comportement réel de la route concernée.

Ne pas considérer comme « en production » une modification uniquement présente dans GitHub.