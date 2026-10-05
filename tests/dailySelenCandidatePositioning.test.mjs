import test from 'node:test';
import assert from 'node:assert/strict';
import {harness, ids, uuid} from './helpers/dailyOwnPositioningHarness.mjs';

const questions=[
 {id:'text',label:'Objectif',type:'free_text',required:true,options:[]},
 {id:'single',label:'Expérience',type:'single_choice',required:true,options:['Débutant','Confirmé']},
 {id:'multiple',label:'Besoins',type:'multiple_choice',required:true,options:['Lire','Écrire']},
 {id:'scale',label:'Confiance',type:'scale_1_5',required:true,options:[]},
 {id:'optional',label:'Précision',type:'free_text',required:false,options:[]},
];
function setup(options={}) {
 const h=harness(options);
 Object.assign(h.formation,{positioning_mode:'selen',positioning_questionnaire_document_url:null,positioning_questions:structuredClone(questions)});
 const payload=(extra={})=>h.body({positioning_answers:{mode:'selen',questions:questions.map(q=>({id:q.id,label:q.label,type:q.type,required:q.required,answer:({text:'Progresser',single:'Débutant',multiple:['Lire'],scale:'4',optional:''})[q.id]}))},...extra});
 return {...h,payload};
}
function changeAnswer(body,id,answer){body.positioning_answers.questions.find(q=>q.id===id).answer=answer;return body;}
for(const [label,mutate,status] of [
 ['empty required questionnaire',b=>b.positioning_answers.questions=[],400],
 ['missing required answer',b=>changeAnswer(b,'text','  '),400],
 ['text object',b=>changeAnswer(b,'text',{forged:true}),400],
 ['unknown single choice',b=>changeAnswer(b,'single','Inventé'),400],
 ['multiple choice string',b=>changeAnswer(b,'multiple','Lire'),400],
 ['empty required multiple choice',b=>changeAnswer(b,'multiple',[]),400],
 ['unknown multiple choice',b=>changeAnswer(b,'multiple',['Inventé']),400],
 ['duplicate multiple choices',b=>changeAnswer(b,'multiple',['Lire','Lire']),400],
 ['scale outside 1 to 5',b=>changeAnswer(b,'scale','6'),400],
 ['non integer scale',b=>changeAnswer(b,'scale','2.5'),400],
 ['unknown question',b=>b.positioning_answers.questions.push({id:'foreign',answer:'secret'}),409],
 ['duplicate question',b=>b.positioning_answers.questions.push({...b.positioning_answers.questions[0]}),400],
 ['missing transmission ID',b=>delete b.submission_id,400],
 ['invalid transmission ID',b=>b.submission_id='not-a-uuid',400],
]) test(`Selen candidature refuses ${label} before writes or confirmation`,async()=>{
 const h=setup();const body=h.payload();mutate(body);const res=await h.post(body);
 assert.equal(res.status,status);assert.equal(h.writes.length,0);assert.equal(h.sends.length,0);assert.equal(h.uploads.length,0);
});
for(const legacy of [false,true]) test(`canonical Selen answers and exact retry are preserved for ${legacy?'session':'formation'} candidature`,async()=>{
 const h=setup({legacy});const body=h.payload();body.positioning_answers.questions[0].label='Forged';body.positioning_answers.external_documents=[{document_id:uuid(99)}];
 const first=await h.post(body);assert.equal(first.status,200);
 const rows=h.db[legacy?'daily_registration_responses':'daily_formation_registration_requests'];const row=rows[0];
 assert.equal(row.id,ids.submission);assert.equal(row.positioning_answers.questions[0].label,'Objectif');assert.equal(row.positioning_answers.questions[0].required,true);
 assert.equal(row.positioning_answers.external_documents,undefined);assert.match(row.positioning_answers.questionnaire_sha256,/^[a-f0-9]{64}$/);
 row.agent_analysis_summary={secret:'private'};const res=await h.post(body),data=await res.json();assert.equal(res.status,200);assert.equal(data.alreadySubmitted,true);
 assert.equal(data.response.agent_analysis_summary,undefined);assert.equal(data.response.positioning_answers,undefined);assert.equal(data.response.signature_data,undefined);
 assert.equal(rows.length,1);assert.equal(h.sends.length,1);assert.equal(h.uploads.length,0);
});
test('concurrent Selen retries insert one candidature and send one simulated confirmation',async()=>{
 const h=setup();const responses=await Promise.all([h.post(h.payload()),h.post(h.payload())]);
 assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.equal(h.db.daily_formation_registration_requests.length,1);assert.equal(h.sends.length,1);
});
test('changed answers cannot reuse a received transmission ID',async()=>{
 const h=setup();await h.post(h.payload());assert.equal((await h.post(changeAnswer(h.payload(),'text','Autre besoin'))).status,409);assert.equal(h.db.daily_formation_registration_requests.length,1);assert.equal(h.sends.length,1);
});
test('questionnaire replacement cannot overwrite received private history',async()=>{
 const h=setup();await h.post(h.payload());const original=structuredClone(h.db.daily_formation_registration_requests[0]);
 h.formation.positioning_questions[0].label='Nouvel objectif';assert.equal((await h.post(h.payload())).status,409);
 assert.deepEqual(h.db.daily_formation_registration_requests[0],original);assert.equal(h.sends.length,1);
});
test('new required question blocks stale candidature',async()=>{
 const h=setup();h.formation.positioning_questions.push({id:'new',label:'Nouveau besoin',type:'free_text',required:true});assert.equal((await h.post(h.payload())).status,400);assert.equal(h.writes.length,0);
});
test('unvalidated or incomplete Selen questionnaire cannot accept a candidature',async()=>{
 for(const change of [h=>h.formation.status='review',h=>h.formation.positioning_questions=[]]) {const h=setup();change(h);assert.equal((await h.post(h.payload())).status,409);assert.equal(h.writes.length,0);assert.equal(h.sends.length,0);}
});
test('closed Selen candidature cannot be replayed',async()=>{
 const h=setup();await h.post(h.payload());h.db.daily_formation_registration_requests[0].decision_status='refused';assert.equal((await h.post(h.payload())).status,409);assert.equal(h.sends.length,1);
});
test('unknown insert result recovers the received Selen candidature without resending',async()=>{
 const h=setup({unknownRequestResult:true});const res=await h.post(h.payload());assert.equal(res.status,200);assert.equal((await res.json()).alreadySubmitted,true);assert.equal(h.db.daily_formation_registration_requests.length,1);assert.equal(h.sends.length,0);
});
test('foreign OF session formation cannot collect Selen answers',async()=>{
 const h=setup({legacy:true});h.formation.organisation_id=uuid(99);assert.equal((await h.post(h.payload())).status,404);assert.equal(h.writes.length,0);assert.equal(h.sends.length,0);
});
test('company JSON retry remains unique without impersonating beneficiary answers',async()=>{
 const h=setup();const body=h.payload({response_type:'company',company_name:'Commanditaire',participants:[h.subject],positioning_answers:{}});
 assert.equal((await h.post(body)).status,200);assert.equal((await h.post(body)).status,200);assert.equal(h.db.daily_formation_registration_requests.length,1);assert.equal(h.sends.length,1);
 assert.equal(h.db.daily_formation_registration_requests[0].positioning_answers.questions,undefined);
});
test('missing OF original cannot silently bypass mandatory filled proof',async()=>{
 const h=harness();h.formation.positioning_questionnaire_document_url=null;
 assert.equal((await h.post(h.body())).status,409);assert.equal(h.writes.length,0);assert.equal(h.sends.length,0);
});
