import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers/dailyAcceptanceHarness.mjs';
function enterprise(options = {}) {
  const h = harness({ ...options, enterprise: true });
  h.db.daily_portal_access_tokens = [{id:'enterprise-access',session_id:'session',portal_type:'enterprise',entity_key:'enterprise:contact@example.test',token:'canonical',status:'pending'}];
  const helper = h.load('lib/server/dailyEnterprisePortalAccess.ts');
  const input = {sessionId:'session',company:{name:'Entreprise',email:' Contact@example.test '},origin:'https://site.test',source:'accepted_registration_request',registrationRequestId:'request'};
  return {...h,helper,input,sendEnterprise: () => helper.ensureAndSendEnterprisePortalAccess(h.admin,input)};
}
test('confirmed enterprise delivery stores complete proof, canonical message and metadata', async () => {
  const h=enterprise(); assert.equal((await h.sendEnterprise()).status,'sent');
  const row=h.db.daily_communications[0];
  assert.equal(row.status,'sent'); assert.ok(row.sent_at); assert.equal(row.provider_message_id,'resend-1');
  assert.equal(row.organisation_id,'org'); assert.equal(row.session_id,'session');
  assert.deepEqual(row.metadata,{portal_access_id:'enterprise-access',entity_key:'enterprise:contact@example.test',registration_request_id:'request',source:'accepted_registration_request'});
  assert.equal(h.sends[0].message.to,'contact@example.test');
  assert.match(h.sends[0].message.text,/https:\/\/site.test\/daily\/portail\/enterprise\/canonical/);
  assert.equal((await h.sendEnterprise()).status,'already_sent'); assert.equal(h.sends.length,1); assert.equal(h.auth.length,0);
});
for(const status of ['queued','sent','delivered','failed','bounced']) for(const proof of ['complete','no_id','no_time']) test(`legacy ${status} ${proof}`,async () => {
  const h=enterprise(); h.db.daily_communications.push({id:'legacy',organisation_id:'org',session_id:'session',communication_type:'enterprise_portal_access',recipient_email:'contact@example.test',metadata:{portal_access_id:'enterprise-access'},status,provider_message_id:proof==='no_id'?null:'provider',sent_at:proof==='no_time'?null:'2026-10-01'});
  assert.equal((await h.sendEnterprise()).status,proof==='complete' && ['sent','delivered'].includes(status)?'already_sent':'pending');
  assert.equal(h.sends.length,0); assert.equal(h.db.daily_communications[0].status,status);
});
for(const options of [{provider:'no_id'},{provider:'throw'},{provider:'ambiguous'},{proofFailure:true},{proofZeroRows:true},{proofThrow:true}]) test(`uncertain attempt never resends ${JSON.stringify(options)}`,async () => {
  const h=enterprise(options); assert.equal((await h.sendEnterprise()).status,'pending'); h.setProvider('success');
  const results=await Promise.all(Array.from({length:5},()=>h.sendEnterprise()));
  assert.ok(results.every(r=>r.status==='pending')); assert.equal(h.sends.length,1);
  assert.equal(h.request.decision_status,'accepted'); assert.equal(h.enrolment.status,'pending'); assert.equal(h.session.id,'session');
});
test('concurrent initial calls reserve once',async () => {
  const h=enterprise(); const results=await Promise.all(Array.from({length:8},()=>h.sendEnterprise()));
  assert.equal(h.sends.length,1); assert.equal(h.db.daily_communications.length,1); assert.equal(results.filter(r=>r.status==='sent').length,1);
});
test('concurrent retries of certain rejection retain message and key',async () => {
  const h=enterprise({provider:'error'}); assert.equal((await h.sendEnterprise()).status,'send_failed');
  h.input.company.name='Changed'; h.setProvider('success');
  const results=await Promise.all(Array.from({length:8},()=>h.sendEnterprise()));
  assert.equal(h.sends.length,2); assert.deepEqual(h.sends[0],h.sends[1]); assert.equal(h.db.daily_communications.length,1); assert.equal(results.filter(r=>r.status==='sent').length,1);
});
test('keys separate enterprises, sessions and learners',async () => {
  const h=enterprise(); await h.sendEnterprise(); h.input.company.email='second@example.test'; await h.sendEnterprise();
  h.session.id='second-session'; h.input.sessionId='second-session'; await h.sendEnterprise();
  h.session.id='session'; await h.send();
  assert.equal(h.sends.length,4); assert.equal(new Set(h.sends.map(s=>s.options.idempotencyKey)).size,4);
});
for(const scenario of ['missing_email','missing_session','archived','missing_provider','create_access']) test(scenario,async () => {
  const h=enterprise({missingProvider:scenario==='missing_provider'});
  if(scenario==='missing_email') h.input.company.email='';
  if(scenario==='missing_session') h.db.daily_sessions=[];
  if(scenario==='archived') h.session.status='archived';
  if(scenario==='create_access') h.db.daily_portal_access_tokens=[];
  const result=await h.sendEnterprise();
  assert.equal(result.status,({missing_email:'missing_email',missing_session:'not_found',archived:'not_found',missing_provider:'send_failed',create_access:'sent'})[scenario]);
  assert.equal(h.auth.length,0); assert.equal(h.sends.length,scenario==='create_access'?1:0);
  if(scenario==='create_access') {await h.sendEnterprise(); assert.equal(h.db.daily_portal_access_tokens.length,1);}
});
test('real accepted materialization route preserves decision and enrolment on uncertain enterprise delivery',async () => {
  const h=enterprise({provider:'throw'}); h.request.response_type='company'; h.request.respondent_email='contact@example.test'; h.request.company_name='Entreprise';
  const result=await h.post({action:'materialize',session_id:'session'});
  assert.equal(result.ok,true); assert.equal(result.materialized,true); assert.equal(result.enterprise_access[0].status,'pending');
  assert.equal(h.request.decision_status,'accepted'); assert.equal(h.enrolment.status,'pending'); assert.equal(h.request.attached_session_id,'session'); assert.equal(h.auth.length,0);
});
test('session company helper targets contacts, skips missing email, preserves pending',async () => {
  const h=enterprise({provider:'no_id'}); h.session.companies=[h.input.company,{name:'No email'},{name:'Other',email:'other@example.test',participants:[{email:'learner@example.test'}]}];
  const results=await h.helper.sendEnterprisePortalAccessForSessionCompanies(h.admin,{sessionId:'session',origin:'https://site.test'});
  assert.deepEqual(Array.from(results,r=>r.status),['pending','pending']); assert.deepEqual(h.sends.map(s=>s.message.to),['contact@example.test','other@example.test']);
});
