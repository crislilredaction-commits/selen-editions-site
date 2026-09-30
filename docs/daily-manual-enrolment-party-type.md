# Partie contractante des inscriptions manuelles Daily

`daily_session_enrolments.contracting_party_type` porte `individual` ou `company` pour une seule inscription. La création manuelle exige un choix explicite ; une entreprise exige `company_name`. Le financement et le SIRET personnel ne participent pas à ce choix.

Le formulaire Apprenants permet la création et l’édition par inscription. L’API existante expose le champ en lecture et en assistance Studio, avec la journalisation existante. Un PATCH qui omet le champ le conserve ; un PATCH explicite nul/invalide est refusé. Les contraintes SQL protègent également les valeurs et le commanditaire requis.

Les générateurs PDF client et documents serveur utilisent le choix canonique en priorité. Pour une convention serveur, le commanditaire doit correspondre à une entreprise de la session ; sinon la génération échoue avant toute écriture documentaire. Les inscriptions individuelles sont exclues de la liste des bénéficiaires d’une convention, même avec un commanditaire commun.

## Compatibilité et migration

La migration additive `20260930120000_daily_enrolment_contracting_party_type.sql` ajoute une colonne nullable sans valeur par défaut ni reprise des données. Les inscriptions historiques et les autres sources d’inscription restent à NULL. En lecture documentaire, une valeur absente conserve exactement la règle antérieure fondée sur le SIRET client/commanditaire du générateur concerné. Aucun choix n’est déduit puis enregistré sur l’apprenant.

La migration doit précéder le déploiement applicatif. Les écritures échouent si la colonne est absente : aucun abandon silencieux du choix. Aucune modification Auth/RLS, de secret ou d’infrastructure. Migration préparée seulement, aucune connexion à une base de production.

## Validation locale

- `node --test tests/dailyManualEnrolmentPartyType.test.mjs` : tests exécutables du helper, POST/PATCH avec doubles de base et d’email, génération serveur avec doubles de stockage et de base ; aucune émission réelle.
- `npm run test:daily-contract-convention`, tests A10, visibilité des inscriptions manuelles et SIRET bénéficiaire : passent.
- `tsc --noEmit --incremental false` : passe.
- Suite globale : deux fichiers de tests échouent déjà sur HEAD, reproduits dans une copie isolée : `dailyFormationCreationEntry.test.mjs` et `dailyQualityRegister.test.mjs`.
- La migration est contrôlée statiquement mais n’a pas été exécutée sur PostgreSQL local. Le CLI Supabase n’est pas installé ; sa récupération via npm échoue (`EAI_AGAIN`). Une validation SQL réelle reste nécessaire dans le workflow disposant d’une base locale.
