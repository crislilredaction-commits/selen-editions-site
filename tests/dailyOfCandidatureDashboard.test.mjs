import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardHarness} from './helpers/dailyDashboardHarness.mjs';
import {ids} from './helpers/dailyTrainerExchangeHarness.mjs';
test('une analyse ready_for_of apparaît en priorité avec un lien vers le bon dossier, sans doublon',async()=>{
 const h=dashboardHarness(),before=JSON.stringify(h.db),html=await h.boot();
 assert.match(html,/Candidature à décider : Alice Exemple/);assert.match(html,new RegExp(`candidatures\\?request=${ids.trainer}`));assert.doesNotMatch(html,/Ancienne action de candidature/);assert.equal((html.match(/Candidature à décider : Alice Exemple/g)??[]).length,1);assert.equal(JSON.stringify(h.db),before);assert.equal(h.sends.length,0);
});
for(const state of ['pending','accepted','refused'])test(`${state} ne crée pas une nouvelle action de décision`,async()=>{
 const h=dashboardHarness({actions:[]});h.db.daily_formation_registration_requests[0].decision_status=state;const html=await h.boot();assert.doesNotMatch(html,/Candidature à décider/);assert.match(html,/Décisions et historique/);
});
test('la candidature d’un autre OF ne remonte pas dans le dashboard',async()=>{
 const h=dashboardHarness({actions:[]});h.db.daily_formations[0].organisation_id=ids.other;const html=await h.boot();assert.doesNotMatch(html,/Alice Exemple|Candidature à décider/);
});
for(const options of [{status:500},{networkFailure:true},{status:403,roles:['manager']}])test('une erreur de candidature est visible sans masquer les autres actions ni prétendre que tout est à jour',async()=>{
 const h=dashboardHarness({...options,actions:[{id:'other',priority:'normal',title:'Autre action utile',detail:'À traiter',href:'/client/daily/sessions'}]}),html=await h.boot();assert.match(html,/role="alert"/);assert.match(html,/Autre action utile/);assert.match(html,/Ouvrir les candidatures/);assert.doesNotMatch(html,/Tout est à jour/);
});
test('un formateur sans droit de décision conserve son accès sans fausse alerte de candidature',async()=>{
 const h=dashboardHarness({status:403,roles:['trainer'],actions:[]}),html=await h.boot();assert.doesNotMatch(html,/role="alert"|Candidature à décider/);
});
test('une décision finale retire une action ancienne sans supprimer son dossier de l’API',async()=>{
 const h=dashboardHarness();h.db.daily_formation_registration_requests[0].decision_status='accepted';h.db.daily_formation_registration_requests[0].materialized_at='2026-10-13T11:00Z';
 const html=await h.boot();assert.doesNotMatch(html,/Ancienne action|Candidature à décider/);assert.equal(h.db.daily_formation_registration_requests.length,1);
});
test('l’assistance lit le bon organisme sans permettre une décision OF',async()=>{
 const h=dashboardHarness({actions:[]});h.context.assisted=true;h.context.user=h.workspace.user;
 const r=await h.api.GET(new Request('https://site.test/api/client/daily/registration-requests')),body=await r.json();assert.equal(r.status,200);assert.equal(body.read_only,true);assert.equal(body.requests[0].can_decide,false);assert.deepEqual(body.actor_types,[]);assert.equal(h.logs.length,1);
 const html=await h.boot();assert.match(html,/Candidature à décider : Alice Exemple/);
 const decision=await h.api.POST(new Request('https://site.test/api/client/daily/registration-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:ids.trainer,decision:'accepted',actor_type:'organisation',session_id:ids.session})}));assert.equal(decision.status,403);
});
test('une décision ou un rejeu d’un autre OF est refusé avant le RPC et avant tout email',async()=>{
 const h=dashboardHarness();h.db.daily_formations[0].organisation_id=ids.other;let calls=0;h.admin.rpc=()=>{calls++;throw Error('Unexpected RPC');};
 for(const decision of ['accepted','refused']){const r=await h.api.POST(new Request('https://site.test/api/client/daily/registration-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:ids.trainer,decision,actor_type:'organisation',session_id:ids.session})}));assert.equal(r.status,403);}
 assert.equal(calls,0);
});
