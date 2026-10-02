import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, ids, uuid } from './helpers/dailyOwnPositioningHarness.mjs';

const helper='lib/server/dailyCurrentPositioningEvidence.ts';
const completion='app/api/client/daily/sessions/completion/route.ts';
const evidence='app/api/client/daily/sessions/[id]/evidence-context/route.ts';
function setup(options={}) {
  const h=harness(options);
  h.session.end_date='2000-01-01';
  const proof={id:uuid(99),formation_id:ids.formation,organisation_id:ids.org,session_id:ids.session,enrolment_id:ids.enrolment,document_type:'positioning_evidence',status:'signed',is_current:true,logical_name:'Historique signé',metadata:{source:'daily_own_positioning',source_document_id:ids.source,source_sha256:h.original.sha256,storage_path:'private metadata'}};
  h.db.daily_documents.push(proof);
  h.db.daily_session_dossiers.push({organisation_id:ids.org,session_id:ids.session,status:'active',completed_at:null});
  h.db.daily_learning_assessments.push({organisation_id:ids.org,session_id:ids.session,enrolment_id:ids.enrolment,outcome:'achieved'});
  return {...h,proof};
}
const current=h=>h.load(helper).filterCurrentOwnPositioningEvidence({admin:h.admin,organisationId:ids.org,formations:[h.formation],documents:[h.proof]});
const view=h=>h.load(evidence).GET(new Request('https://site.test'),{params:Promise.resolve({id:ids.session})});

for (const source of ['daily_own_positioning','daily_learner_own_positioning']) test(`signed ${source} remains current only for its original version`,async()=>{
  const h=setup();h.proof.metadata.source=source;
  assert.equal((await current(h)).length,1);
  h.formation.positioning_questionnaire_document_url=`/api/client/daily/uploads?id=${uuid(88)}`;
  h.db.daily_documents.push({...h.original,id:uuid(88),sha256:'d'.repeat(64)});
  assert.equal((await current(h)).length,0);
  assert.equal(h.proof.is_current,true);assert.equal(h.proof.status,'signed');assert.equal(h.writes.length,0);
});
for(const [label,change] of [
  ['changed original checksum',h=>h.original.sha256='d'.repeat(64)],
  ['archived source',h=>h.original.status='archived'],
  ['superseded source',h=>h.original.is_current=false],
  ['other OF source',h=>h.original.organisation_id=uuid(88)],
  ['wrong source binding',h=>h.original.linked_object_id=uuid(88)],
  ['foreign private path',h=>h.original.storage_path=`daily/${uuid(88)}/file.pdf`],
  ['source tied to another formation',h=>h.original.formation_id=uuid(88)],
  ['switched to Selen questionnaire',h=>h.formation.positioning_mode='selen'],
])test(`current own evidence excludes ${label}`,async()=>{const h=setup();change(h);assert.equal((await current(h)).length,0);assert.equal(h.writes.length,0);});

test('obsolete signed positioning neither closes a dossier nor appears among active proofs',async()=>{
  const h=setup();h.proof.metadata.source_document_id=uuid(88);
  const response=await h.load(completion).GET(new Request('https://site.test'));
  assert.equal(response.status,200);
  const stats=(await response.json()).completion[ids.session];
  assert.equal(stats.completed,1);assert.equal(stats.expected,2);assert.equal(stats.dossierStatus,'active');
  const context=await view(h);assert.equal(context.status,200);assert.equal((await context.json()).documents.length,0);
  const reconciled=await h.load('lib/server/dailySessionCompletion.ts').reconcileDailySessionDossier({admin:h.admin,organisationId:ids.org,sessionId:ids.session});
  assert.equal(reconciled.closed,false);assert.equal(reconciled.completed,1);
  assert.equal(h.writes.length,0);assert.equal(h.sends.length,0);
});
test('a signed proof for the current questionnaire counts without exposing internal metadata',async()=>{
  const h=setup();const context=await view(h);assert.equal(context.status,200);
  const {documents}=await context.json();assert.equal(documents.length,1);
  assert.equal(documents[0].id,h.proof.id);assert.equal('metadata' in documents[0],false);assert.equal('formation_id' in documents[0],false);
  const response=await h.load(completion).GET(new Request('https://site.test'));
  assert.equal(response.status,200);const stats=(await response.json()).completion[ids.session];
  assert.equal(stats.completed,2);assert.equal(stats.dossierStatus,'completed');assert.equal(h.sends.length,0);
});
test('legacy manual evidence and learning assessment proofs retain their existing behavior',async()=>{
  const h=setup();h.proof.metadata={source:'daily_external_positioning'};h.formation.positioning_mode='selen';
  assert.equal((await current(h)).length,1);
  h.proof.document_type='learning_assessment_evidence';h.proof.metadata.source='daily_own_positioning';
  assert.equal((await current(h)).length,1);
});
test('source verification failure stops both views and dossier reconciliation',async()=>{
  const h=setup({failCurrentSourceRead:true});
  assert.equal((await h.load(completion).GET(new Request('https://site.test'))).status,500);
  assert.equal((await view(h)).status,500);
  await assert.rejects(h.load('lib/server/dailySessionCompletion.ts').reconcileDailySessionDossier({admin:h.admin,organisationId:ids.org,sessionId:ids.session}),/version du positionnement/);
  assert.equal(h.writes.length,0);
});
test('existing OF read authorization still blocks the two views',async()=>{
  const h=setup({noSessionAccess:true});
  assert.equal((await h.load(completion).GET(new Request('https://site.test'))).status,403);
  assert.equal((await view(h)).status,403);assert.equal(h.writes.length,0);
});
