# Candidature publique et partie contractante — diagnostic du 1er octobre 2026

## État initial vérifié avant modification

- Branche courante : `fix/daily-public-registration-party-type-20261001`.
- HEAD et référence locale `origin/main` : `3f823e1856720df2a0e46180667b3eff0b0691ab`.
- Main réel vérifié par le connecteur GitHub, `github_fetch_commit` avec `commit_sha: "main"`, dépôt `crislilredaction-commits/selen-editions-site` : même SHA, commit de la PR #289. La commande `git ls-remote origin ...` avait échoué avec `Could not resolve host: github.com` ; elle n'est pas présentée comme une vérification distante réussie.
- `git status --porcelain=v1` initial vide : arbre cible propre.

## Arrêt demandé : couplage entre commanditaire documentaire et visibilité du portail

La correction fonctionnelle n'a pas été engagée. La consigne utilisateur impose : « Arrêter avec diagnostic si cela impose de changer les droits des portails » et interdit l'exposition de données privées supplémentaires dans un nouveau périmètre API.

Le code actuel utilise la même identité textuelle pour deux fonctions :

1. `app/api/client/daily/pretraining-documents/route.ts:100` exige, pour une inscription `company`, une société de session dont le nom est égal à `enrolment.company_name`. Le regroupement des apprenants de la convention utilise également cette égalité, ligne 134.
2. `app/api/daily-portal/[token]/route.ts:38` retrouve la société du portail par email **ou nom**. La ligne 40 retourne ensuite les inscriptions dont `company_name` correspond, avec prénom, nom et email du candidat. Aucun lien d'autorisation distinct entre cette inscription et ce contact entreprise n'est vérifié à cet endroit.

Ainsi, pour un apprenant choisissant `company`, stocker le commanditaire sur l'inscription dans le champ attendu par les documents peut rendre ses coordonnées visibles à un accès entreprise préexistant portant ce nom. L'absence d'email commanditaire et l'absence de création de token ne neutralisent pas cet effet. Le cas existe aussi avec deux sociétés homonymes ; le nom libre ne distingue pas leurs identités.

Conserver le commanditaire uniquement dans `need_answers` ne satisfait pas la préparation documentaire existante. Laisser `enrolment.company_name` vide échoue sur la garde documentaire. Préremplir une société sans email ne supprime pas la correspondance par nom avec un portail existant. Ajouter un suffixe artificiel au nom altérerait l'identité documentaire et créerait potentiellement un doublon. Une résolution complète exige une décision sur la séparation entre identité contractuelle et autorisation de consultation du portail, hors du périmètre autorisé ici.

Un second couplage a été constaté par lecture, sans modification : `lib/server/dailyEnterprisePortalAccess.ts:117` traite le rôle `company` comme déclencheur ; il reprend `respondent_email`, synchronise la société puis assure l'accès entreprise. Le commanditaire explicite ne doit donc pas être raccordé naïvement à ce chemin. Les corrections de preuve d'envoi #287/#289 sont restées intactes.

## Reproduction comportementale exécutée

Vrai export `GET` de `app/api/daily-portal/[token]/route.ts`, compilé avec TypeScript puis exécuté en VM. Double SDK limité aux tables et opérations de lecture attendues ; aucune méthode de mutation, aucun SDK Auth/Resend chargé, imports inattendus et `fetch` interdits.

Fixtures entièrement synthétiques : même session, même société de session, même token entreprise déjà `viewed`, même inscription explicite `company`. Aucun dossier dans `daily_registration_responses`. Deux appels ne diffèrent que par `enrolment.company_name` :

- `NULL` : HTTP 200, aucun participant visible ;
- `Commanditaire` : HTTP 200, un participant visible, dont `candidate-private@example.test`.

Exécution : `/home/LilBarthaux/.nvm/versions/node/v24.20.0/bin/node /tmp/daily-public-party-portal-diagnostic.cjs`, code 0. Le script exact est conservé ci-dessous pour reproduction depuis la racine du dépôt. Il démontre le comportement du handler existant avec fixtures ; il ne prétend pas avoir exercé une migration ni une base réelle.

## Validations et migration

- Diagnostic comportemental ci-dessus : réussi (le couplage de visibilité est reproduit).
- `npm test`, `npm run typecheck`, `npm run build` : non exécutés, arrêt avant implémentation pour le garde-fou sensible demandé. Aucun résultat global de validation n'est revendiqué.
- `git diff --check` : réussi avant rédaction ; revérifié après rédaction.
- Migration : non préparée et non appliquée, puisque la correction complète est bloquée par le périmètre portail. Aucun test PostgreSQL exécuté ; disponibilité d'un PostgreSQL isolé non recherchée après cet arrêt.
- Seul ce rapport est ajouté au dépôt. Aucun code applicatif, workflow, droit, RLS, schéma, donnée, automate d'email ou accès n'est modifié. Aucun commit, push ou PR.

## Script de reproduction

Enregistrer ce bloc dans `/tmp/daily-public-party-portal-diagnostic.cjs`, puis lancer la commande ci-dessus depuis la racine du dépôt.

```javascript
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require(process.cwd() + '/node_modules/typescript');
const source = fs.readFileSync('app/api/daily-portal/[token]/route.ts', 'utf8');
async function run(companyName) {
  const db = {
    daily_portal_access_tokens: [{token:'existing-token',id:'access',status:'viewed',portal_type:'enterprise',session_id:'session',user_id:'owner',entity_email:'existing-contact@example.test',entity_name:'Commanditaire',entity_key:'enterprise:existing-contact@example.test'}],
    daily_sessions: [{id:'session',organisation_id:'org',status:'ready',companies:[{name:'Commanditaire',email:'existing-contact@example.test'}]}],
    daily_onboarding: [], daily_registration_responses: [], daily_conventions: [], daily_trainers: [], daily_convocations: [],
    daily_session_enrolments: [{id:'new-enrolment',session_id:'session',learner_id:'learner',status:'pending',contracting_party_type:'company',company_name:companyName,daily_learners:{id:'learner',first_name:'Candidate',last_name:'Test',email:'candidate-private@example.test'}}],
  };
  const admin = {from(table) {
    assert.ok(Object.hasOwn(db, table), `Unexpected table ${table}`);
    const predicates = []; let single = false;
    const q = {
      select(fields) { assert.equal(typeof fields, 'string'); return q; },
      eq(k,v) { predicates.push(row => row[k] === v); return q; },
      neq(k,v) { predicates.push(row => row[k] !== v); return q; },
      not(k,op,v) { assert.equal(k,'status'); assert.equal(op,'in'); assert.equal(v,'(declined,cancelled,abandoned)'); predicates.push(row => !['declined','cancelled','abandoned'].includes(row.status)); return q; },
      maybeSingle() {single = true; return q;},
      then(resolve,reject) { return Promise.resolve().then(() => {const rows=db[table].filter(row=>predicates.every(p=>p(row))); return {data:single ? rows[0] ?? null : rows,error:null};}).then(resolve,reject); },
    }; return q;
  }};
  const module = {exports:{}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    module,exports:module.exports,Date,
    fetch() {throw new Error('Network forbidden');},
    require(name) {
      if(name==='next/server') return {NextResponse:{json:(body,init)=>({body,status:init?.status ?? 200})}};
      if(name==='@/lib/server/clientNdaAccess') return {getAdminSupabase:()=>admin};
      throw new Error(`Unexpected import / SDK: ${name}`);
    },
  });
  return module.exports.GET({}, {params:Promise.resolve({token:'existing-token'})});
}
(async()=>{
  const before=await run(null), after=await run('Commanditaire');
  assert.equal(before.status,200); assert.equal(before.body.participants.length,0);
  assert.equal(after.status,200); assert.equal(after.body.participants.length,1);
  assert.equal(after.body.participants[0].email,'candidate-private@example.test');
  assert.equal(after.body.responses.length,0);
  console.log('CONFIRMED: same existing enterprise token sees 0 participants before sponsor name, 1 participant including private candidate email after sponsor name. No candidature response, sponsor email, SDK, mutation or network required.');
})().catch(error=>{console.error(error);process.exitCode=1;});
```
