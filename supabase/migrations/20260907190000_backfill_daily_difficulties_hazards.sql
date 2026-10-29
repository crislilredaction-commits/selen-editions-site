insert into public.daily_internal_procedures (
  organisation_id,
  procedure_type,
  title,
  purpose,
  steps,
  responsibilities,
  evidence,
  status
)
select distinct
  existing.organisation_id,
  'difficulties_hazards',
  'Prévention des difficultés et aléas',
  'Anticiper les difficultés et aléas susceptibles de perturber une formation, prévoir une réponse proportionnée et conserver une trace des mesures prises lorsqu’elles ont un impact sur le parcours ou la qualité de la prestation.',
  E'Pour chaque difficulté ou aléa, l’organisme vérifie d’abord la situation, contacte les personnes concernées, choisit une solution adaptée puis trace l’action lorsqu’elle a un impact sur la formation.\n\nAbsence ou retard d’un apprenant — Prévention : rappeler les horaires et modalités de signalement. Solution : prendre contact, identifier le motif, proposer si nécessaire un rattrapage ou une adaptation et tracer le suivi.\n\nRisque de décrochage ou d’abandon — Prévention : repérer les absences répétées, difficultés ou signaux faibles. Solution : organiser un échange, rechercher les causes, proposer une adaptation du parcours et formaliser les décisions.\n\nAbsence ou indisponibilité du formateur — Prévention : anticiper les indisponibilités connues et identifier une solution de remplacement lorsque cela est possible. Solution : informer rapidement les parties prenantes, mobiliser un remplaçant éligible ou replanifier la séquence.\n\nPrérequis insuffisants ou difficulté pédagogique — Prévention : vérifier les prérequis et le positionnement en amont. Solution : adapter les modalités, proposer des ressources complémentaires, un accompagnement ou réorienter si la formation n’est pas adaptée.\n\nBesoin d’accessibilité ou situation de handicap non anticipée — Prévention : recueillir les besoins avant l’entrée en formation et mobiliser le référent handicap. Solution : rechercher un aménagement raisonnable, solliciter les partenaires utiles et tracer l’adaptation retenue.\n\nIncident technique, matériel ou connexion en distanciel — Prévention : tester les équipements et prévoir une solution de secours. Solution : assistance technique, changement de matériel ou de modalité, accès différé ou replanification selon l’impact.\n\nLocaux indisponibles ou inadaptés — Prévention : confirmer la disponibilité et l’adéquation des locaux avant la session. Solution : mobiliser un autre lieu, passer en distanciel si pertinent ou replanifier en informant les participants.\n\nAccident, problème de santé ou situation de sécurité — Prévention : communiquer les consignes et vérifier les conditions d’accueil. Solution : protéger les personnes, alerter les secours si nécessaire, interrompre la séquence concernée et enregistrer l’incident.\n\nConflit, comportement inadapté, violence, harcèlement ou discrimination — Prévention : rappeler le règlement et les canaux de signalement. Solution : faire cesser la situation, protéger les personnes, recueillir les faits et appliquer la procédure de signalement ou de réclamation appropriée.\n\nDocument, justificatif ou signature manquant — Prévention : contrôler le dossier avant les échéances et relancer en amont. Solution : demander la régularisation, renvoyer le document ou mettre en attente l’étape qui ne peut légalement ou contractuellement se poursuivre.\n\nDifficulté ou anomalie d’évaluation — Prévention : préciser les consignes et vérifier les conditions d’évaluation. Solution : analyser l’anomalie, mettre en place l’adaptation autorisée, une nouvelle évaluation ou une replanification si nécessaire.\n\nInsatisfaction ou réclamation — Prévention : faciliter l’expression des retours pendant et après la formation. Solution : accuser réception, analyser la situation, répondre, décider d’une action corrective si nécessaire et assurer le suivi.\n\nAléa externe ou cas de force majeure — Prévention : surveiller les événements prévisibles et préparer une solution alternative. Solution : informer sans délai, adapter la modalité ou replanifier la formation.\n\nAprès traitement, l’organisme vérifie si l’événement doit alimenter un incident, une réclamation, une adaptation, une action corrective ou l’amélioration continue.',
  'La personne chargée du suivi de la session détecte ou centralise l’alerte. Le formateur traite ce qui relève de la pédagogie et signale tout événement ayant un impact sur le parcours. Le référent handicap intervient pour les besoins d’accessibilité. Le responsable de l’organisme arbitre les adaptations importantes, les replanifications et les suites à donner aux incidents ou réclamations.',
  'Selon la situation : échanges avec les personnes concernées, feuilles de présence, fiche de suivi de session, adaptation formalisée, incident ou réclamation, justificatifs, nouvelle planification, action corrective et décision d’amélioration continue.',
  'draft'
from public.daily_internal_procedures existing
where not exists (
  select 1
  from public.daily_internal_procedures target
  where target.organisation_id = existing.organisation_id
    and target.procedure_type = 'difficulties_hazards'
)
on conflict (organisation_id, procedure_type) do nothing;
