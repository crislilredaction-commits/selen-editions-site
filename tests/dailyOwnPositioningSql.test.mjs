import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { harness } from './helpers/dailyOwnPositioningHarness.mjs';

const migration = await fs.readFile(new URL('../supabase/migrations/20261002160230_daily_own_positioning_evidence.sql', import.meta.url), 'utf8');
const schema = await fs.readFile(new URL('./fixtures/dailyOwnPositioningSchema.sql', import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG=id(1), USER=id(2), FORM=id(3), SESSION=id(4), SOURCE=id(5), REQUEST=id(6), DOC=id(7);
const SUBJECT={first_name:'Alice',last_name:'Martin',email:'alice@example.test'};
const HASH='a'.repeat(64), FILLED='b'.repeat(64), FINGERPRINT='c'.repeat(64);

test('real PostgreSQL positioning migration: candidature, enrolment, versions and privileges', async t => {
  const db=new PGlite();
  await db.exec(schema);
  await db.exec(`begin;${migration}commit;`);
  t.after(async()=>db.close());
  const tables=['daily_documents','daily_registration_request_enrolments','daily_session_enrolments','daily_learners','daily_formation_registration_requests','daily_registration_responses','daily_sessions','daily_formations'];
  async function insert(table, row) {
    const columns=Object.keys(row), values=Object.values(row).map(value=>typeof value==='object'&&value!==null?JSON.stringify(value):value);
    return (await db.query(`insert into public.${table} (${columns.join(',')}) values (${values.map((_,i)=>`$${i+1}`).join(',')}) returning *`,values)).rows[0];
  }
  async function one(table, key) { return (await db.query(`select * from public.${table} where id=$1`,[key])).rows[0]; }
  const answers=(docs=[DOC])=>({mode:'off_platform',source_document_id:SOURCE,source_sha256:HASH,submission_fingerprint:FINGERPRINT,external_documents:docs.map((doc,i)=>({document_id:doc,participant_index:i,sha256:FILLED}))});
  async function seed(overrides={}) {
    await db.exec(`truncate ${tables.map(table=>`public.${table}`).join(',')}`);
    await insert('daily_formations',{id:FORM,organisation_id:ORG,user_id:USER,title:'Formation QA',global_objective:'Objectif',target_audience:'Public',prerequisites:'Aucun',duration_hours:7,duration_days:1,modality:'presentiel',modality_details:'Salle',access_delays:'Délai',registration_methods:'Candidature',price:'100',detailed_program:'Programme',accessibility:'Contact',pedagogical_resources:'Support',evaluation_methods:'Évaluation',contact_phone:'0102030405',contact_email:'of@example.test',status:'validated',positioning_mode:'off_platform',positioning_questionnaire_document_url:`/api/client/daily/uploads?id=${SOURCE}`,...overrides.formation});
    await insert('daily_sessions',{id:SESSION,user_id:USER,organisation_id:ORG,formation_id:FORM,modality:'presentiel',status:'ready',...overrides.session});
    await insert('daily_documents',{id:SOURCE,organisation_id:ORG,document_type:'positioning_questionnaire_source',linked_object_type:'organisation',linked_object_id:ORG,version:1,status:'to_check',logical_name:'Questionnaire',bucket:'documents',storage_path:`daily/${ORG}/original.pdf`,sha256:HASH,mime_type:'application/pdf',...overrides.source});
  }
  async function request(overrides={}) {return insert('daily_formation_registration_requests',{id:REQUEST,formation_id:FORM,user_id:USER,response_type:'beneficiary',respondent_first_name:SUBJECT.first_name,respondent_last_name:SUBJECT.last_name,respondent_email:SUBJECT.email,decision_status:'accepted',positioning_answers:answers(),...overrides});}
  async function proof(overrides={}) {return insert('daily_documents',{id:DOC,organisation_id:ORG,formation_id:FORM,document_type:'positioning_application_evidence',linked_object_type:'registration_request',linked_object_id:REQUEST,version:1,status:'to_check',logical_name:'Positionnement rempli',bucket:'documents',storage_path:`daily/${ORG}/${DOC}.pdf`,sha256:FILLED,mime_type:'application/pdf',metadata:{source:'daily_own_positioning',source_document_id:SOURCE,source_sha256:HASH,submission_fingerprint:FINGERPRINT,participant_index:0,subject_first_name:SUBJECT.first_name,subject_last_name:SUBJECT.last_name,subject_email:SUBJECT.email},...overrides});}
  async function materialize() {return db.query('select public.daily_materialize_registration_request($1,$2)',[REQUEST,SESSION]);}

  await t.test('assigned session after mappings attaches the exact existing file once',async()=>{
    await seed();await proof();await request();await materialize();
    const doc=await one('daily_documents',DOC), req=await one('daily_formation_registration_requests',REQUEST), enrol=await one('daily_session_enrolments',doc.enrolment_id);
    assert.equal(req.attached_session_id,SESSION);assert.equal(doc.document_type,'positioning_evidence');
    assert.equal(doc.linked_object_id,enrol.id);assert.equal(doc.session_id,SESSION);assert.equal(doc.learner_id,enrol.learner_id);assert.equal(doc.formation_id,FORM);
    assert.equal(enrol.positioning_status,'completed');assert.equal(enrol.prerequisites_status,'not_reviewed');assert.equal(enrol.contracting_party_type,null);assert.equal(doc.status,'to_check');
    assert.equal(doc.sha256,FILLED);assert.equal(doc.metadata.source_request_id,REQUEST);
    await materialize();assert.equal((await db.query('select count(*)::int n from public.daily_documents')).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int n from public.daily_session_enrolments')).rows[0].n,1);
  });
  await t.test('no acceptance is manufactured by a received file',async()=>{
    await seed();await proof();await request({decision_status:'pending'});
    await assert.rejects(materialize(),/must be accepted first/);
    assert.equal((await one('daily_documents',DOC)).document_type,'positioning_application_evidence');
    assert.equal((await one('daily_formation_registration_requests',REQUEST)).decision_status,'pending');
  });
  await t.test('each company participant including canonical aliases gets only their own proof',async()=>{
    await seed();await proof();await proof({id:id(8),storage_path:`daily/${ORG}/${id(8)}.pdf`,metadata:{source:'daily_own_positioning',source_document_id:SOURCE,source_sha256:HASH,submission_fingerprint:FINGERPRINT,participant_index:1,subject_first_name:'Bob',subject_last_name:'Durand',subject_email:'bob@example.test'}});
    await request({response_type:'company',company_name:'Client QA',participants:[SUBJECT,{firstName:'Bob',lastName:'Durand',mail:'bob@example.test'}],positioning_answers:answers([DOC,id(8)])});await materialize();
    const docs=(await db.query("select d.id,l.email,e.positioning_status from public.daily_documents d join public.daily_session_enrolments e on e.id=d.enrolment_id join public.daily_learners l on l.id=e.learner_id order by d.id")).rows;
    assert.deepEqual(docs.map(row=>[row.id,row.email,row.positioning_status]),[[DOC,SUBJECT.email,'completed'],[id(8),'bob@example.test','completed']]);
  });
  const mismatches={
    'other OF':{organisation_id:id(99)}, 'wrong formation':{formation_id:id(99)}, 'wrong candidature':{linked_object_id:id(99)}, 'wrong kind':{linked_object_type:'registration_response'},
    'public bucket':{bucket:'selen-documents'},'foreign private path':{storage_path:`daily/${id(99)}/private.pdf`},'wrong file hash':{sha256:'d'.repeat(64)},'archived file':{status:'archived'},'old version':{is_current:false},
    'different participant':{metadata:{source:'daily_own_positioning',source_document_id:SOURCE,source_sha256:HASH,submission_fingerprint:FINGERPRINT,participant_index:0,subject_first_name:'Mallory',subject_last_name:'Martin',subject_email:SUBJECT.email}},
    'wrong fingerprint':{metadata:{source:'daily_own_positioning',source_document_id:SOURCE,source_sha256:HASH,submission_fingerprint:'d'.repeat(64),participant_index:0,subject_first_name:SUBJECT.first_name,subject_last_name:SUBJECT.last_name,subject_email:SUBJECT.email}},
  };
  for(const [label,change]of Object.entries(mismatches))await t.test(`candidate proof rejects ${label}`,async()=>{
    await seed();await proof(change);await request();await materialize();
    const doc=await one('daily_documents',DOC);assert.equal(doc.document_type,'positioning_application_evidence');assert.equal(doc.enrolment_id,null);
    assert.equal((await db.query('select positioning_status from public.daily_session_enrolments')).rows[0].positioning_status,'not_started');
  });
  for(const [label,change]of Object.entries({'another OF original':{organisation_id:id(99)},'original not linked to OF':{linked_object_id:id(99)},'archived original':{status:'archived'},'replaced original':{is_current:false},'wrong original checksum':{sha256:'d'.repeat(64)}}))await t.test(`source guards: ${label}`,async()=>{
    await seed({source:change});await proof();await request();await materialize();assert.equal((await one('daily_documents',DOC)).enrolment_id,null);
  });
  await t.test('unvalidated formation cannot complete a deposit; revalidation attaches it',async()=>{
    await seed({formation:{status:'draft'}});await proof();await request();await materialize();assert.equal((await one('daily_documents',DOC)).enrolment_id,null);
    await db.query("update public.daily_formations set status='validated' where id=$1",[FORM]);assert.equal((await one('daily_documents',DOC)).document_type,'positioning_evidence');
  });
  await t.test('cancelled enrolment remains incomplete',async()=>{
    await seed();const l=await insert('daily_learners',{organisation_id:ORG,...SUBJECT});await insert('daily_session_enrolments',{organisation_id:ORG,session_id:SESSION,learner_id:l.id,status:'cancelled'});await proof();await request();await materialize();assert.equal((await one('daily_documents',DOC)).enrolment_id,null);
    assert.equal((await db.query('select positioning_status from public.daily_session_enrolments')).rows[0].positioning_status,'not_started');
  });
  for(const enrolFirst of [false,true])await t.test(`legacy session response attaches when enrolment ${enrolFirst?'already exists':'arrives later'}`,async()=>{
    await seed();const l=await insert('daily_learners',{organisation_id:ORG,...SUBJECT});
    if(enrolFirst)await insert('daily_session_enrolments',{organisation_id:ORG,session_id:SESSION,learner_id:l.id});
    await proof({session_id:SESSION,linked_object_type:'registration_response'});
    await insert('daily_registration_responses',{id:REQUEST,session_id:SESSION,user_id:USER,response_type:'beneficiary',respondent_first_name:SUBJECT.first_name,respondent_last_name:SUBJECT.last_name,respondent_email:SUBJECT.email,positioning_answers:answers()});
    if(!enrolFirst)await insert('daily_session_enrolments',{organisation_id:ORG,session_id:SESSION,learner_id:l.id});
    assert.equal((await one('daily_documents',DOC)).document_type,'positioning_evidence');assert.equal((await db.query('select positioning_status from public.daily_session_enrolments')).rows[0].positioning_status,'completed');
  });
  await t.test('learner upload needs the complete canonical triplet and OF source',async()=>{
    await seed();const l=await insert('daily_learners',{organisation_id:ORG,...SUBJECT});const e=await insert('daily_session_enrolments',{organisation_id:ORG,session_id:SESSION,learner_id:l.id});
    await assert.rejects(proof({document_type:'positioning_evidence'}),/assessment_evidence_triplet_check/);
    await proof({document_type:'positioning_evidence',linked_object_type:'enrolment',linked_object_id:e.id,session_id:SESSION,learner_id:l.id,enrolment_id:e.id,metadata:{source:'daily_learner_own_positioning',source_document_id:SOURCE,source_sha256:HASH}});
    assert.equal((await one('daily_session_enrolments',e.id)).positioning_status,'completed');assert.equal((await one('daily_session_enrolments',e.id)).prerequisites_status,'not_reviewed');
  });
  for(const signed of [false,true])await t.test(`changing source preserves ${signed?'signed':'unsigned'} history and resets current demand`,async()=>{
    await seed();await proof();await request();await materialize();const prior=await one('daily_documents',DOC);
    if(signed)await db.query("update public.daily_documents set status='signed',signed_at=now() where id=$1",[DOC]);
    const l=await insert('daily_learners',{organisation_id:ORG,first_name:'Other',last_name:'Learner',email:'other@example.test'});
    const closed=await insert('daily_session_enrolments',{organisation_id:ORG,session_id:SESSION,learner_id:l.id,status:'cancelled',positioning_status:'completed'});
    await proof({id:id(19),document_type:'positioning_questionnaire_source',linked_object_type:'organisation',linked_object_id:ORG,storage_path:`daily/${ORG}/new-source.pdf`,sha256:'d'.repeat(64)});
    await db.query('update public.daily_formations set positioning_questionnaire_document_url=$1 where id=$2',[`/api/client/daily/uploads?id=${id(19)}`,FORM]);
    const old=await one('daily_documents',DOC);assert.equal(old.sha256,prior.sha256);assert.equal(old.storage_path,prior.storage_path);assert.equal(old.is_current,signed);assert.equal(old.status,signed?'signed':'to_check');
    assert.equal((await one('daily_session_enrolments',prior.enrolment_id)).positioning_status,'not_started');assert.equal((await one('daily_session_enrolments',closed.id)).positioning_status,'completed');
    assert.equal((await db.query('select count(*)::int n from public.daily_documents')).rows[0].n,3);
    // Read the actual PostgreSQL state through the same consumer used by both OF views.
    const h=harness();h.db.daily_documents=(await db.query('select * from public.daily_documents')).rows;
    const currentDocuments=await h.load('lib/server/dailyCurrentPositioningEvidence.ts').filterCurrentOwnPositioningEvidence({
      admin:h.admin,organisationId:ORG,formations:[await one('daily_formations',FORM)],documents:[old],
    });
    assert.equal(currentDocuments.length,0,'the retained signed copy must not count for the new questionnaire');
    const stats=h.load('lib/server/dailySessionCompletion.ts').calculateDailySessionCompletion({sessionId:SESSION,checklist:[],enrolments:[await one('daily_session_enrolments',prior.enrolment_id)],documents:currentDocuments,assessmentResponses:[],recordedAssessments:[]});
    assert.equal(stats.completed,0);assert.equal(stats.expected,2);assert.equal(h.writes.length,0);
  });
  await t.test('all new helpers remain security invoker and inaccessible as public RPCs',async()=>{
    const functions=(await db.query("select proname,prosecdef,has_function_privilege('anon',oid,'EXECUTE') a,has_function_privilege('authenticated',oid,'EXECUTE') u,has_function_privilege('service_role',oid,'EXECUTE') s from pg_proc where proname like 'daily_own_positioning_%' or proname='daily_attach_own_positioning_candidate'")).rows;
    assert.equal(functions.length,4);for(const fn of functions){assert.equal(fn.prosecdef,false);assert.equal(fn.a,false);assert.equal(fn.u,false);assert.equal(fn.s,true);}
    await db.exec('set role anon');await assert.rejects(db.query('select public.daily_attach_own_positioning_candidate($1,$2)',['formation',REQUEST]),/permission denied/);await db.exec('reset role');
  });
});
