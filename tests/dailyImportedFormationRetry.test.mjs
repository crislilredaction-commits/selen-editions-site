import test from 'node:test';
import assert from 'node:assert/strict';
import {harness, ids, uuid} from './helpers/dailyOwnPositioningHarness.mjs';

export function importedCreationFixture(options={}) {
 const h=harness({allowFormationWrite:true,...options});const programId=uuid(20);
 h.db.daily_documents.push({...h.original,id:programId,document_type:'training_program_source'});
 const body={creation_mode:'program_import',title:'Programme original',duration_hours:7,duration_days:1,modality:'presentiel',contact_phone:'0102030405',contact_email:'of@example.test',detailed_program_document_url:`/api/client/daily/uploads?id=${programId}`,prerequisite_mode:'none',positioning_mode:'selen',positioning_questions:[{id:'goal',label:'Objectif',type:'free_text',required:true}],creation_submission_id:uuid(30)};
 const post=payload=>h.load('app/api/client/daily/formations/route.ts').POST(new Request('https://site.test/api/client/daily/formations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload??body)}));
 return {...h,body,post,created:()=>h.db.daily_formations.filter(f=>f.id!==ids.formation)};
}

test('exact imported programme retry keeps one formation, original and public link',async()=>{
 const h=importedCreationFixture();const first=await h.post();assert.equal(first.status,200);const initial=await first.json();
 const repeat=await h.post();assert.equal(repeat.status,200);const result=await repeat.json();
 assert.equal(result.alreadyCreated,true);assert.equal(result.formation.id,h.body.creation_submission_id);assert.equal(result.formation.public_registration_token,initial.formation.public_registration_token);
 assert.equal(h.created().length,1);assert.equal(h.writes.length,1);assert.equal(h.db.daily_documents.length,2);assert.equal(h.sends.length,0);
});
test('concurrent imported programme retries share the primary-key winner',async()=>{
 const h=importedCreationFixture();assert.deepEqual((await Promise.all([h.post(),h.post()])).map(r=>r.status),[200,200]);assert.equal(h.created().length,1);assert.equal(h.writes.length,1);
});
test('replay after agent correction and validation preserves its current work and link',async()=>{
 const h=importedCreationFixture();await h.post();const row=h.created()[0];Object.assign(row,{title:'Programme relu et corrigé',status:'validated',detailed_program:'Contenu saisi par l’agent',spontaneous_registration_task_status:'to_attach'});h.original.is_current=false;
 const before=structuredClone(row);assert.equal((await h.post()).status,200);assert.deepEqual(row,before);assert.equal(h.created().length,1);assert.equal(h.writes.length,1);
});
for(const change of ['title','programme','positioning','assessment'])test(`changed ${change} cannot reuse an imported creation identity`,async()=>{
 const h=importedCreationFixture();await h.post();const body=structuredClone(h.body);
 if(change==='title')body.title='Autre titre';else if(change==='programme')body.detailed_program_document_url=`/api/client/daily/uploads?id=${uuid(99)}`;else if(change==='positioning')body.positioning_questions[0].label='Autre question';else {body.learning_assessment_mode='selen_quiz';body.learning_assessment_questions=[{id:'final',label:'Question finale',type:'free_text',required:true}];}
 assert.equal((await h.post(body)).status,409);assert.equal(h.created().length,1);assert.equal(h.writes.length,1);
});
for(const value of [undefined,'','not-a-uuid'])test(`imported creation without a valid identity ${String(value)} is refused before writes`,async()=>{
 const h=importedCreationFixture();assert.equal((await h.post({...h.body,creation_submission_id:value})).status,400);assert.equal(h.created().length,0);assert.equal(h.writes.length,0);
});
test('ambiguous insertion response recovers the committed import without a second write',async()=>{
 const h=importedCreationFixture();const original=h.admin.from.bind(h.admin);let lost=false;
 h.admin.from=table=>{const q=original(table);if(table==='daily_formations'){let inserting=false;const insert=q.insert.bind(q),then=q.then.bind(q);q.insert=v=>{inserting=true;return insert(v);};q.then=(resolve,reject)=>then(result=>{if(inserting&&!lost&&result.data){lost=true;return resolve({data:null,error:{code:'transport_lost'}});}return resolve(result);},reject);}return q;};
 const response=await h.post();assert.equal(response.status,200);assert.equal((await response.json()).alreadyCreated,true);assert.equal(h.created().length,1);assert.equal(h.writes.length,1);
});
test('a nonce belonging to another OF gives no foreign formation or metadata',async()=>{
 const h=importedCreationFixture();h.db.daily_formations.push({id:h.body.creation_submission_id,organisation_id:uuid(99),title:'Foreign private programme',creation_submission_fingerprint:'a'.repeat(64)});
 const response=await h.post();assert.equal(response.status,409);assert.equal((await response.text()).includes('Foreign private programme'),false);assert.equal(h.writes.length,0);
});
test('creation retries still require the current authenticated training capability',async()=>{
 const h=importedCreationFixture({noFormationAccess:true});assert.equal((await h.post()).status,403);assert.equal(h.writes.length,0);
});
test('the browser cannot choose the stored server receipt fingerprint',async()=>{
 const h=importedCreationFixture();assert.equal((await h.post({...h.body,creation_submission_fingerprint:'b'.repeat(64)})).status,200);assert.match(h.created()[0].creation_submission_fingerprint,/^[a-f0-9]{64}$/);assert.notEqual(h.created()[0].creation_submission_fingerprint,'b'.repeat(64));
});

test('intentional catalogue duplication does not inherit the original creation receipt',async()=>{
 let nextUuid=1000;const h=importedCreationFixture({randomUUID:()=>uuid(nextUuid++)});await h.post();const source=h.created()[0];
 const response=await h.post({action:'duplicate',id:source.id});assert.equal(response.status,200);const copy=(await response.json()).formation;
 assert.notEqual(copy.id,source.id);assert.notEqual(copy.public_registration_token,source.public_registration_token);assert.equal(copy.creation_submission_fingerprint,undefined);assert.equal(h.created().length,2);assert.equal(h.writes.length,2);
});
