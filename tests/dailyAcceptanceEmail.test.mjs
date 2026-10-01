import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers/dailyAcceptanceHarness.mjs';

const statuses = results => Array.from(results, r => r.status);
test('accepted without session sends useful acceptance once, then materialization sends canonical access once', async () => {
  const h=harness();
  assert.deepEqual(statuses(await h.send()),['sent']);
  assert.equal(h.auth.length,0);
  assert.match(h.sends[0].message.text,/session et votre inscription seront finalisées/);
  assert.doesNotMatch(h.sends[0].message.text,/token_hash|contrat individuel|convention de formation/);
  assert.deepEqual(statuses(await h.send()),['already_sent']);
  assert.equal(h.sends.length,1);
  const result=await h.post({action:'materialize',session_id:'session'});
  assert.equal(result.materialized,true);
  assert.deepEqual(statuses(result.learner_access),['sent']);
  assert.equal(h.sends.length,2); assert.equal(h.auth.length,1);
  assert.match(h.sends[1].message.text,/Activer mon accès/);
  assert.match(h.sends[1].message.text,/12 caractères/);
  assert.match(h.sends[1].message.text,/lien personnel/);
  assert.deepEqual(statuses(await h.send()),['already_sent']); assert.equal(h.sends.length,2);
});
for(const attached of [false,true]) test(`real decision route accepted, attached=${attached}`,async () => {
  const h=harness(); h.request.decision_status='ready_for_of'; if(attached) h.request.attached_session_id='session';
  const result=await h.post({decision:'accepted',actor_type:'organisation'});
  assert.equal(result.ok,true); assert.equal(result.materialized,attached);
  assert.deepEqual(statuses(result.learner_access),['sent']); assert.equal(h.sends.length,1); assert.equal(h.auth.length,attached?1:0);
  await h.post({decision:'accepted',actor_type:'organisation'}); assert.equal(h.sends.length,1);
});
test('failed materialization preserves acceptance and sends acceptance without Auth',async () => {
  const h=harness({materializeFailure:true}); h.request.decision_status='ready_for_of'; h.request.attached_session_id='session';
  const result=await h.post({decision:'accepted',actor_type:'organisation'});
  assert.equal(result.ok,true); assert.equal(result.materialized,false); assert.equal(h.request.decision_status,'accepted');
  assert.deepEqual(statuses(result.learner_access),['sent']); assert.equal(h.auth.length,0);
});
for(const status of ['pending','refused','rejected','ready_for_of']) test(`${status} cannot send acceptance even via manager retry`,async () => {
  const h=harness(); h.request.decision_status=status;
  assert.deepEqual(statuses(await h.send()),['invalid_scope']); await h.post({action:'send_learner_access'});
  assert.equal(h.sends.length,0); assert.equal(h.auth.length,0);
});
test('refusal route sends no acceptance, nonmanager cannot retry',async () => {
  const h=harness(); h.request.decision_status='ready_for_of'; await h.post({decision:'refused',actor_type:'organisation'}); assert.equal(h.sends.length,0);
  const denied=harness({nonManager:true}); assert.equal((await denied.post({action:'send_learner_access'})).status,403); assert.equal(denied.sends.length,0);
});
for(const mismatch of ['organisation','session_organisation','session_formation','learner','enrolment','recipient','link']) test(`scope mismatch ${mismatch} prevents email/Auth`,async () => {
  const h=harness({materialized:true});
  if(mismatch==='organisation') h.formation.organisation_id='foreign';
  if(mismatch==='session_organisation') h.session.organisation_id='foreign';
  if(mismatch==='session_formation') h.session.formation_id='foreign';
  if(mismatch==='learner') h.learner.organisation_id='foreign';
  if(mismatch==='enrolment') h.enrolment.organisation_id='foreign';
  if(mismatch==='recipient') h.learner.email='other-candidate@example.test';
  if(mismatch==='link') h.db.daily_registration_request_enrolments=[];
  if(mismatch==='link') assert.equal((await h.ensure()).status,'invalid_scope'); else await h.send();
  assert.equal(h.sends.length,0); assert.equal(h.auth.length,0);
});
test('company participants aliases, deduplication, missing emails; never sponsor or another candidate',async () => {
  const h=harness(); h.request.response_type='company'; h.request.respondent_email='sponsor@example.test';
  h.request.participants=[{first_name:'Alice',last_name:'One',email:'A@example.test'},{firstname:'Bob',lastname:'Two',mail:'b@example.test'},{firstName:'Chloé',lastName:'Three',email:'c@example.test'},{email:' a@example.test '},{first_name:'Missing'}];
  const results=await h.send(); assert.deepEqual(statuses(results),['sent','sent','sent','missing_email']);
  assert.deepEqual(h.sends.map(s=>s.message.to),['a@example.test','b@example.test','c@example.test']);
  assert.match(h.sends[0].message.text,/Bonjour Alice One/); assert.doesNotMatch(h.sends[0].message.text,/Bob|Chloé|sponsor/);
  assert.match(h.sends[1].message.text,/Bonjour Bob Two/); assert.match(h.sends[2].message.text,/Bonjour Chloé Three/);
});
for(const materialized of [false,true]) test(`missing email explicit, materialized=${materialized}`,async () => {
  const h=harness({materialized}); h.request.respondent_email=''; h.learner.email='';
  assert.deepEqual(statuses(await h.send()),['missing_email']); assert.equal(h.sends.length,0); assert.equal(h.auth.length,0);
});
for(const party of ['individual','company',null]) test(`contract derived only from enrolment ${party}`,async () => {
  const h=harness({materialized:true}); h.enrolment.contracting_party_type=party; h.enrolment.company_name='Entreprise A'; h.enrolment.funding_type='company'; h.learner.siret='123';
  await h.send(); const body=h.sends[0].message.text;
  assert.equal(body.includes('contrat individuel'),party==='individual'); assert.equal(body.includes('convention de formation'),party==='company');
  assert.equal(body.includes('Entreprise A'),party==='company');
  if(party===null) assert.match(body,/documents de contractualisation/);
});
test('same learner, second session uses its own contracting party',async () => {
  const h=harness({materialized:true}); h.enrolment.contracting_party_type='individual'; await h.send();
  h.session.id='second'; h.enrolment.id='second-enrolment'; h.enrolment.session_id='second'; h.enrolment.contracting_party_type='company'; h.request.attached_session_id='second'; h.db.daily_registration_request_enrolments[0].enrolment_id='second-enrolment';
  await h.send(); assert.equal(h.sends.length,2); assert.match(h.sends[0].message.text,/contrat individuel/); assert.match(h.sends[1].message.text,/convention de formation/);
});
for(const source of ['manual_enrolment','manual_resend']) test(`${source} never announces OF acceptance`,async () => {
  const h=harness(); assert.equal((await h.ensure({source,force:source==='manual_resend'})).status,'sent');
  assert.doesNotMatch(h.sends[0].message.text,/acceptée|candidature/); assert.match(h.sends[0].message.text,/Activer mon accès/);
});
test('complete escaped HTML and matching text, truthful documents and public PDF',async () => {
  const h=harness({materialized:true}); await h.send(); const {html,text}=h.sends[0].message;
  for(const fragment of ['OF <test>','14 heures','0102030405','of@example.test','2026-10-05','09:00','17:00','1 rue Exemple','relus, modifiés','validés par un agent','Après signature','convocation','livret','règlement']) assert.ok(text.includes(fragment),fragment);
  assert.doesNotMatch(html,/<test>|<Nom>/); assert.match(html,/&lt;test&gt;/);
  for(const paragraph of html.matchAll(/<p>([^]*?)<\/p>/g)) {
    if(paragraph[1].includes('<a ')) continue;
    const decoded=paragraph[1].replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#039;',"'").replaceAll('&amp;','&'); assert.ok(text.includes(decoded));
  }
  assert.match(text,/https:\/\/site.test\/api\/daily-registration\/public-token\/program-pdf/);
  assert.match(html,/href="https:\/\/site.test\/client\/activation\?token_hash=mock&amp;next=personal"/);
});
for(const modality of ['distanciel','presentiel',null]) test(`schedule modality ${modality}, no invented times`,async () => {
  const h=harness({materialized:true}); h.session.modality=modality; h.session.schedule_blocks=[]; h.session.start_date=null;
  if(modality==='distanciel') {h.session.distance_mode='asynchrone'; h.session.schedule_blocks=[{date:'2026-10-05',start:'09:00',end:'17:00'}];}
  await h.send(); const text=h.sends[0].message.text; assert.match(text,/à confirmer/); assert.doesNotMatch(text,/09:00|17:00/);
  if(modality==='distanciel') assert.match(text,/à votre rythme/); else assert.match(text,/Horaires : à confirmer/);
});
test('synchronous remote session includes known times and remote access',async () => {
  const h=harness({materialized:true}); h.session.modality='distanciel'; h.session.distance_mode='synchrone'; h.session.remote_url='https://class.test/room'; await h.send(); assert.match(h.sends[0].message.text,/09:00/); assert.match(h.sends[0].message.text,/https:\/\/class.test\/room/);
});
for(const [key,value] of [['status','draft'],['creation_mode','import'],['public_registration_enabled',false],['public_registration_token',null]]) test(`PDF absent when ${key}=${value}`,async () => {
  const h=harness(); h.formation[key]=value; h.formation.detailed_program_document_url='https://private.test/file'; await h.send(); assert.doesNotMatch(h.sends[0].message.text,/program-pdf|private.test/); assert.match(h.sends[0].message.text,/demander à l’organisme/);
});
for(const options of [{provider:'error'},{provider:'no_id'},{provider:'throw'},{provider:'ambiguous'},{proofFailure:true},{proofZeroRows:true},{claimFailure:true},{authFailure:true,materialized:true}]) test(`failure evidence ${JSON.stringify(options)}`,async () => {
  const h=harness(options); const results=await h.send(); assert.ok(['pending','send_failed'].includes(results[0].status)); assert.equal(h.request.decision_status,'accepted'); assert.equal(h.enrolment.status,'pending');
  if(options.provider!=='error' && !options.claimFailure && !options.authFailure) { await h.send(); assert.equal(h.sends.length,1); }
  if(options.authFailure || options.claimFailure) assert.equal(h.sends.length,0);
});
test('definite rejection retried from manager action with stable message and idempotency key',async () => {
  const h=harness({provider:'error',materialized:true}); assert.equal((await h.send())[0].status,'send_failed'); h.setProvider('success');
  assert.equal((await h.post({action:'send_learner_access'})).learner_access[0].status,'sent'); assert.equal(h.auth.length,1);
  assert.deepEqual(h.sends[0],h.sends[1]);
});
test('concurrent acceptance retries share durable claim',async () => {
  const h=harness(); const results=await Promise.all([h.send(),h.send(),h.send()]); assert.equal(h.sends.length,1); assert.ok(results.some(r=>r[0].status==='sent'));
});
for(const status of ['queued','sent','delivered','bounced']) test(`legacy evidence ${status} without ID is never already_sent`,async () => {
  const h=harness({materialized:true}); h.db.daily_communications.push({id:'legacy',organisation_id:'org',session_id:'session',communication_type:'learner_portal_access',recipient_email:h.learner.email,status,metadata:{portal_access_id:'access',enrolment_id:'enrolment',auth_protected:true}});
  assert.notEqual((await h.send())[0].status,'already_sent'); assert.equal(h.sends.length,0);
});
