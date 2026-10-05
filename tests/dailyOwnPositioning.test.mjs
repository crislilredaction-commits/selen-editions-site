import test from 'node:test';
import assert from 'node:assert/strict';
import { harness,ids,uuid,blank,filled } from './helpers/dailyOwnPositioningHarness.mjs';

async function output(response){return{status:response.status,body:await response.json()};}
const route='app/api/daily-registration/[token]/positioning-document/route.ts';
const learnerRoute='app/api/daily-portal/[token]/positioning-document/route.ts';

test('own questionnaire is downloadable from the actual candidate token as private bytes',async()=>{
 const h=harness();const r=await h.load(route).GET(new Request('https://site.test'),h.params('candidate-token'));
 assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),blank);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('location'),null);
 assert.equal(h.writes.length,0);assert.equal(h.sends.length,0);
});
for(const [label,mutate,status]of [
 ['other OF',h=>h.original.organisation_id=uuid(99),409],['foreign private path',h=>h.original.storage_path=`daily/${uuid(99)}/private.pdf`,409],['public bucket',h=>h.original.bucket='selen-documents',409],['replaced original',h=>h.original.is_current=false,409],['unvalidated formation',h=>h.formation.status='draft',409],['disabled registration',h=>h.formation.public_registration_enabled=false,404],['wrong document type',h=>h.original.document_type='training_agreement',409],['absolute URL',h=>h.formation.positioning_questionnaire_document_url='https://private.test/file',409],['another formation source',h=>h.original.formation_id=uuid(99),409],
])test(`private candidate download rejects ${label}`,async()=>{const h=harness();mutate(h);const r=await h.load(route).GET(new Request('https://site.test'),h.params('candidate-token'));assert.equal(r.status,status);assert.equal(h.downloads.length,0);assert.equal(h.writes.length,0);});

test('candidate metadata exposes the download descriptor without a raw OF URL',async()=>{
 const h=harness();const r=await output(await h.load('app/api/daily-registration/[token]/route.ts').GET(new Request('https://site.test'),h.params('candidate-token')));
 assert.equal(r.status,200);assert.equal(r.body.ownPositioning.id,ids.source);assert.equal(r.body.session.daily_formations.positioning_questionnaire_document_url,undefined);
});
for(const [label,make,status]of [
 ['JSON without reimport',h=>h.body(),400],['missing filled file',h=>h.multipart({},[]),400],['wrong source version',h=>h.multipart({positioning_source_id:uuid(99)}),409],['blank original instead of filled copy',h=>h.multipart({},[new File([blank],'blank.pdf',{type:'application/pdf'})]),400],['fake PDF',h=>h.multipart({},[new File(['not PDF'],'fake.pdf',{type:'application/pdf'})]),400],['unsupported file',h=>h.multipart({},[new File([filled],'file.txt',{type:'text/plain'})]),400],['missing identity',h=>h.multipart({respondent_email:''}),400],['oversized filled file',h=>h.multipart({},[new File([Buffer.alloc(3*1024*1024+1)],'big.pdf',{type:'application/pdf'})]),413],['missing signature consent',h=>h.multipart({signature_consent:false}),400],
])test(`candidate submission refuses ${label} before any mutation or email`,async()=>{const h=harness();const r=await output(await h.post(make(h)));assert.equal(r.status,status);assert.equal(h.uploads.length,0);assert.equal(h.writes.length,0);assert.equal(h.sends.length,0);});

test('received proof is private and bound to one candidature; exact retry neither duplicates nor resends',async()=>{
 const h=harness();const form=h.multipart({positioning_answers:{external_documents:[{document_id:uuid(99)}],source_sha256:'forged'}});
 const first=await output(await h.post(form));assert.equal(first.status,200);assert.equal(h.uploads.length,1);assert.equal(h.sends.length,1);
 const req=h.db.daily_formation_registration_requests[0],doc=h.db.daily_documents[1];assert.equal(req.id,ids.submission);assert.equal(doc.linked_object_id,req.id);assert.equal(doc.bucket,'documents');assert.equal(doc.document_type,'positioning_application_evidence');assert.equal(doc.status,'to_check');assert.equal(doc.enrolment_id,undefined);
 assert.equal(req.positioning_answers.external_documents[0].document_id,doc.id);assert.notEqual(doc.id,uuid(99));assert.match(req.signature_proof_hash,/^[0-9a-f]{64}$/);
 req.agent_analysis_summary={private:'analysis'};
 const second=await output(await h.post(h.multipart({positioning_answers:{external_documents:[{document_id:uuid(99)}],source_sha256:'forged'}})));assert.equal(second.status,200);assert.equal(second.body.alreadySubmitted,true);assert.equal(second.body.response.agent_analysis_summary,undefined);assert.equal(second.body.response.positioning_answers,undefined);assert.equal(second.body.response.signature_data,undefined);
 assert.equal(h.uploads.length,1);assert.equal(h.sends.length,1);assert.equal(h.db.daily_formation_registration_requests.length,1);
});
test('changed submission data cannot reuse a received nonce',async()=>{const h=harness();await h.post();const r=await output(await h.post(h.multipart({need_answers:{expectations:'Changed'}})));assert.equal(r.status,409);assert.equal(h.uploads.length,1);assert.equal(h.sends.length,1);});
test('closed candidature cannot be replayed',async()=>{const h=harness();await h.post();h.db.daily_formation_registration_requests[0].decision_status='refused';assert.equal((await h.post()).status,409);assert.equal(h.sends.length,1);});
test('unknown insert result recovers the persisted candidature without a second confirmation',async()=>{const h=harness({unknownRequestResult:true});const r=await output(await h.post());assert.equal(r.status,200);assert.equal(r.body.alreadySubmitted,true);assert.equal(h.db.daily_formation_registration_requests.length,1);assert.equal(h.sends.length,0);});
for(const failure of ['failUpload','failDocumentWrite','failRequestWrite'])test(`${failure} cannot report a completed candidature or send confirmation`,async()=>{const h=harness({[failure]:true});const r=await output(await h.post());assert.equal(r.status,500);assert.equal(h.sends.length,0);assert.equal(h.db.daily_formation_registration_requests.length,0);});

test('each company participant requires a filled document; learner identities cannot share an email',async()=>{
 const h=harness();const company={response_type:'company',company_name:'Client QA',participants:[h.subject,{first_name:'Bob',last_name:'Durand',email:'bob@example.test'}]};
 assert.equal((await h.post(h.multipart(company))).status,400);assert.equal(h.uploads.length,0);
 assert.equal((await h.post(h.multipart({...company,participants:[h.subject,h.subject]},[new File([filled],'A.pdf',{type:'application/pdf'}),new File([filled],'B.pdf',{type:'application/pdf'})]))).status,400);
 const r=await h.post(h.multipart(company,[new File([filled],'A.pdf',{type:'application/pdf'}),new File([Buffer.from('%PDF-1.7 Bob rempli')],'B.pdf',{type:'application/pdf'})]));assert.equal(r.status,200);assert.equal(h.uploads.length,2);assert.equal(h.db.daily_documents[2].metadata.subject_email,'bob@example.test');
});
test('legacy session candidature uses the same mandatory private proof contract',async()=>{const h=harness({legacy:true});assert.equal((await h.post(h.body())).status,400);assert.equal((await h.post()).status,200);assert.equal(h.db.daily_documents[1].linked_object_type,'registration_response');assert.equal(h.db.daily_documents[1].session_id,ids.session);});
test('Selen questionnaire without imported original uses JSON and the configured questions',async()=>{const h=harness();h.formation.positioning_mode='selen';h.formation.positioning_questionnaire_document_url=null;h.formation.positioning_questions=[{id:'q1',label:'Objectif',type:'free_text',required:true}];assert.equal((await h.post(h.body({positioning_answers:{mode:'selen',questions:[{id:'q1',answer:'Answer'}]}}))).status,200);assert.equal(h.uploads.length,0);assert.equal(h.db.daily_formation_registration_requests[0].positioning_answers.questions[0].answer,'Answer');assert.equal(h.db.daily_formation_registration_requests[0].positioning_answers.questions[0].label,'Objectif');});

for(const [label,change,status]of [
 ['anonymous',h=>h.setUser(null),401],['other Auth identity',h=>h.setUser({email:'mallory@example.test'}),403],['non learner portal',h=>h.access.portal_type='trainer',404],['revoked access',h=>h.access.status='revoked',403],['expired access',h=>h.access.expires_at='2020-01-01T00:00:00Z',410],['invalid expiry',h=>h.access.expires_at='not a date',410],['contradictory learner ID',h=>h.access.metadata.learner_id=uuid(99),403],['legacy access without learner binding',h=>{h.access.entity_key='legacy';h.access.metadata={};},403],['cancelled enrolment',h=>h.enrolment.status='cancelled',404],['wrong OF learner',h=>h.learner.organisation_id=uuid(99),404],['wrong formation OF',h=>h.formation.organisation_id=uuid(99),404],['forged metadata identity',h=>h.setUser({email:'mallory@example.test',user_metadata:{email:h.subject.email,learner_id:ids.learner}}),403],
])test(`private learner download rejects ${label}`,async()=>{const h=harness();change(h);const r=await h.load(learnerRoute).GET(new Request('https://site.test'),h.params('learner-token'));assert.equal(r.status,status);assert.equal(h.downloads.length,0);assert.equal(h.writes.length,0);});
test('learner original and filled copy require the same exact enrolment; another candidature stays private',async()=>{
 const h=harness();assert.equal((await h.load(learnerRoute).GET(new Request('https://site.test'),h.params('learner-token'))).status,200);
 const form=new FormData();form.set('positioning_source_id',ids.source);form.set('submission_id',ids.submission);form.set('positioning_file_0',new File([filled],'Alice.pdf',{type:'application/pdf'}));
 const post=h.load('app/api/daily-portal/[token]/positioning/route.ts').POST;
 const result=await output(await post(new Request('https://site.test',{method:'POST',body:form}),h.params('learner-token')));assert.equal(result.status,200);assert.equal(result.body.status,'completed');
 const doc=h.db.daily_documents[1];assert.equal(doc.enrolment_id,ids.enrolment);assert.equal(doc.learner_id,ids.learner);assert.equal(doc.metadata.subject_email,h.subject.email);
 let r=await h.load(learnerRoute).GET(new Request(`https://site.test?id=${doc.id}`),h.params('learner-token'));assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),filled);
 const repeat=await output(await post(new Request('https://site.test',{method:'POST',body:new FormData()}),h.params('learner-token')));assert.equal(repeat.body.alreadySubmitted,true);assert.equal(h.uploads.length,1);
 doc.enrolment_id=uuid(99);r=await h.load(learnerRoute).GET(new Request(`https://site.test?id=${doc.id}`),h.params('learner-token'));assert.equal(r.status,404);assert.equal(h.sends.length,0);
});


test('OF candidature returns verified proof descriptors without answers or storage paths',async()=>{
 const h=harness();await h.post();const r=await output(await h.load('app/api/client/daily/registration-requests/route.ts').GET());
 assert.equal(r.status,200);const req=r.body.requests[0];assert.equal(req.positioning_documents[0].id,h.db.daily_documents[1].id);assert.equal(req.positioning_documents[0].name,'Alice.pdf');
 assert.equal(req.positioning_answers,undefined);assert.equal(req.signature_data,undefined);assert.equal(JSON.stringify(r.body).includes('positioning-applications/'),false);assert.equal(JSON.stringify(r.body).includes('submission_fingerprint'),false);
});
for(const [label,change] of [
 ['wrong OF',doc=>doc.organisation_id=uuid(99)],['wrong formation',doc=>doc.formation_id=uuid(99)],['other request',doc=>doc.linked_object_id=uuid(99)],['public bucket',doc=>doc.bucket='selen-documents'],['changed hash',doc=>doc.sha256='d'.repeat(64)],['forged source',doc=>doc.metadata.source_document_id=uuid(99)],['archived proof',doc=>doc.status='archived'],
])test(`OF descriptors reject ${label}`,async()=>{const h=harness();await h.post();change(h.db.daily_documents[1]);const r=await output(await h.load('app/api/client/daily/registration-requests/route.ts').GET());assert.equal(r.status,200);assert.deepEqual(r.body.requests[0].positioning_documents,[]);});
test('non manager cannot retrieve private candidature documents',async()=>{const h=harness({nonManager:true});assert.equal((await h.load('app/api/client/daily/registration-requests/route.ts').GET()).status,403);});
test('asynchronous candidature replay retains its actual next step',async()=>{const h=harness();h.session.modality='distanciel';h.session.distance_mode='asynchrone';const first=await output(await h.post());const repeat=await output(await h.post());assert.equal(first.body.nextStep,'asynchronous');assert.equal(repeat.body.nextStep,'asynchronous');assert.equal(h.sends.length,1);});


const formationBody=()=>({creation_mode:'selen_form',title:'Formation QA',global_objective:'Objectif',learning_objectives:['Objectif pédagogique'],target_audience:'Public',prerequisites:'Aucun',prerequisite_mode:'none',duration_hours:7,duration_days:1,modality:'presentiel',modality_details:'Salle',access_delays:'Délai',registration_methods:'Candidature',price:'100',detailed_program:'Programme',accessibility:'Contact',pedagogical_resources:'Support',pedagogical_methods:'Méthodes',evaluation_methods:'Évaluation',contact_phone:'0102030405',contact_email:'of@example.test',positioning_mode:'off_platform',positioning_questionnaire_document_url:`/api/client/daily/uploads?id=${ids.source}`});
async function formationCall(h,method,body){return h.load('app/api/client/daily/formations/route.ts')[method](new Request('https://site.test',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({...method==='PATCH'?{expected_updated_at:h.formation.updated_at}:{},...body})}));}
for(const [label,change,status]of [
 ['missing original',body=>body.positioning_questionnaire_document_url=null,400],['unowned original',body=>body.positioning_questionnaire_document_url=`/api/client/daily/uploads?id=${uuid(99)}`,409],['external URL',body=>body.positioning_questionnaire_document_url='https://storage.test/file.pdf',409],
])test(`formation creation refuses ${label} before mutation`,async()=>{const h=harness({allowFormationWrite:true});const body=formationBody();change(body);assert.equal((await formationCall(h,'POST',body)).status,status);assert.equal(h.writes.length,0);});
test('formation creation retains the owned original; later edit keeps its registration link',async()=>{
 const h=harness({allowFormationWrite:true});const created=await output(await formationCall(h,'POST',formationBody()));assert.equal(created.status,200);assert.equal(created.body.formation.positioning_questionnaire_document_url,formationBody().positioning_questionnaire_document_url);
 const result=await output(await formationCall(h,'PATCH',{...formationBody(),id:ids.formation,positioning_choice_confirmed:true,title:'Updated'}));assert.equal(result.status,200);assert.equal(result.body.formation.public_registration_token,'candidate-token');assert.equal(result.body.formation.status,'review');
});
test('formation edit cannot remove a configured mandatory original',async()=>{const h=harness({allowFormationWrite:true});assert.equal((await formationCall(h,'PATCH',{...formationBody(),id:ids.formation,positioning_questionnaire_document_url:null})).status,400);assert.equal(h.writes.length,0);});
test('historical unconfigured formation remains editable until a new positioning choice',async()=>{const h=harness({allowFormationWrite:true});h.formation.positioning_questionnaire_document_url=null;const body={...formationBody(),id:ids.formation,positioning_questionnaire_document_url:null};assert.equal((await formationCall(h,'PATCH',body)).status,200);assert.equal((await formationCall(h,'PATCH',{...body,positioning_choice_confirmed:true})).status,400);});
test('private original validation does not bypass existing formation Auth',async()=>{const h=harness({allowFormationWrite:true,noFormationAccess:true});assert.equal((await formationCall(h,'POST',formationBody())).status,403);assert.equal(h.writes.length,0);});

test('simultaneous exact retries create one candidature, one durable proof and one confirmation',async()=>{const h=harness();const responses=await Promise.all([h.post(),h.post()]);assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.equal(h.db.daily_formation_registration_requests.length,1);assert.equal(h.db.daily_documents.length,2);assert.equal(h.storage.size,2);assert.equal(h.sends.length,1);});
test('a private upload interrupted after file persistence resumes the same bytes',async()=>{const options={failRequestWrite:true};const h=harness(options);assert.equal((await h.post()).status,500);options.failRequestWrite=false;assert.equal((await h.post()).status,200);assert.equal(h.uploads.length,1);assert.equal(h.db.daily_documents.length,2);assert.equal(h.sends.length,1);});
test('retry cannot reuse a pending proof relinked to another candidature',async()=>{const options={failRequestWrite:true};const h=harness(options);await h.post();h.db.daily_documents[1].linked_object_id=uuid(99);options.failRequestWrite=false;assert.equal((await h.post()).status,409);assert.equal(h.db.daily_formation_registration_requests.length,0);assert.equal(h.sends.length,0);});
test('a retained historical filled copy is readable only by its bound learner',async()=>{const h=harness();const proof={id:uuid(99),organisation_id:ids.org,formation_id:ids.formation,session_id:ids.session,learner_id:ids.learner,enrolment_id:ids.enrolment,linked_object_type:'enrolment',linked_object_id:ids.enrolment,document_type:'positioning_evidence',bucket:'documents',storage_path:`daily/${ids.org}/historical.pdf`,is_current:false,status:'signed',metadata:{source_document_id:uuid(88),original_filename:'Historique.pdf'}};h.db.daily_documents.push(proof);h.storage.set(proof.storage_path,filled);assert.equal((await h.load(learnerRoute).GET(new Request(`https://site.test?id=${proof.id}`),h.params('learner-token'))).status,200);h.setUser({email:'bob@example.test'});assert.equal((await h.load(learnerRoute).GET(new Request(`https://site.test?id=${proof.id}`),h.params('learner-token'))).status,403);});
