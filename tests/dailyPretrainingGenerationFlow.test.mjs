import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
import {delegatedHarness,ids,token,uuid} from './helpers/delegatedRegistrationHarness.mjs';
import {loadTypeScript} from './helpers/loadTypeScript.mjs';
const require=createRequire(import.meta.url);

test('génération canonique Daily : documents manquants, modèles et portail',async t=>{
 const h=await delegatedHarness();t.after(()=>h.db.close());
 await h.db.exec(`alter table daily_trainer_profiles add column professional_email text,add column display_name text;
 create table daily_attendance_slots(id uuid,organisation_id uuid,session_id uuid,slot_date date,starts_at time,ends_at time,status text);
 create table daily_audit_logs(id uuid,organisation_id uuid,actor_user_id uuid,actor_type text,actor_role text,object_type text,object_id uuid,action text,occurred_at timestamptz,after_data jsonb,context jsonb,origin text);
 create table daily_document_templates(id uuid default gen_random_uuid(),user_id uuid,document_type text,template_source text,template_name text,template_version int,storage_path text,status text);
 create table daily_enrolment_support_needs(id uuid,enrolment_id uuid,organisation_id uuid,has_specific_needs boolean,needs_description text,planned_accommodations text);
 `);
 await h.db.exec(await readFile(new URL('../supabase/migrations/20261014012515_daily_trainer_personal_signature.sql',import.meta.url),'utf8'));
 await h.db.exec('grant all on all tables in schema public to service_role');
 const storage=new Map(),audits=[];
 const allowed=(await h.q("select tablename from pg_tables where schemaname='public'")).rows.map(r=>r.tablename);
 const admin={from(table){assert.ok(allowed.includes(table),table);const filters=[];let single=false,limit,order,operation='select',payload;
  const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},not(k,op,v){assert.equal(op,'in');filters.push(r=>!v.slice(1,-1).split(',').includes(r[k]));return q;},order(k,{ascending=true}={}){order=[k,ascending];return q;},limit(n){limit=n;return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},insert(v){payload=v;operation='insert';return q;},update(v){payload=v;operation='update';return q;},then(resolve,reject){return(async()=>{
   let rows=JSON.parse(JSON.stringify((await h.q(`select * from ${table}`)).rows)).filter(row=>filters.every(f=>f(row)));
   if(order)rows.sort((a,b)=>(Number(a[order[0]])-Number(b[order[0]]))*(order[1]?1:-1));if(limit)rows=rows.slice(0,limit);
   if(operation==='insert')rows=[await h.insert(table,payload)];
   if(operation==='update')for(const row of rows){const keys=Object.keys(payload);await h.q(`update ${table} set ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} where id=$${keys.length+1}`,[...Object.values(payload),row.id]);Object.assign(row,payload);}
   if(table==='daily_sessions')for(const row of rows)row.daily_formations=(await h.q('select * from daily_formations where id=$1',[row.formation_id])).rows[0];
   if(table==='daily_session_enrolments')for(const row of rows)row.daily_learners=(await h.q('select * from daily_learners where id=$1',[row.learner_id])).rows[0];
   return{data:single?rows[0]??null:rows,error:null};
  })().then(resolve,reject);}};return q;
 },storage:{from(bucket){assert.equal(bucket,'documents');return{upload:async(path,blob)=>{assert.equal(storage.has(path),false);storage.set(path,Buffer.from(await blob.arrayBuffer()));return{error:null};},remove:async paths=>{paths.forEach(p=>storage.delete(p));return{error:null};},download:async path=>({data:storage.has(path)?new Blob([storage.get(path)]):null,error:null})};}},async rpc(name,args){assert.equal(name,'daily_assert_document_delegation');try{return{data:(await h.q('select daily_assert_document_delegation($1,$2,$3) as actor',[args.p_assistance_id,args.p_token_hash,args.p_organisation_id])).rows[0].actor,error:null};}catch(error){return{data:null,error:{code:error.code,message:error.message}};}}};
 const template=loadTypeScript('lib/server/dailyPretrainingTemplate.ts',{docxtemplater:{default:require('docxtemplater')},pizzip:{default:require('pizzip')}},{Buffer,TextEncoder,Error});
 const html=loadTypeScript('lib/server/dailyPretrainingDocumentHtml.ts');const party=loadTypeScript('lib/dailyContractingParty.ts');
 const context=async()=>({ok:true,admin,organisationId:ids.org,user:{id:ids.owner},assisted:true,assistance:(await h.q('select * from selen_agent_assistance_tokens where id=$1',[ids.assistance])).rows[0]});
 const route=loadTypeScript('app/api/client/daily/pretraining-documents/route.ts',{'next/server':{NextResponse:{json:Response.json}},'@/lib/server/dailyOrganisationContext':{getDailyOrganisationContext:context,getDailyOrganisationBillingUserId:async()=>ids.owner},'@/lib/server/dailyDelegatedRegistrationDecision':h.guard,'@/lib/server/agentAssistance':{logAgentAssistanceAction:async args=>audits.push(args)},'@/lib/server/dailyPretrainingDocumentHtml':html,'@/lib/dailyContractingParty':party,'@/lib/server/dailyPretrainingTemplate':template},{Blob,TextEncoder,crypto:webcrypto,Date,Error});
 const post=(body={})=>route.POST(new Request('https://daily.example.test/api/client/daily/pretraining-documents',{method:'POST',headers:{'Content-Type':'application/json','x-selen-agent-assistance':token},body:JSON.stringify({session_id:ids.oldSession,only_missing:true,confirm_delegated:true,...body})}));
 assert.equal((await h.call({p_action:'accept_historical',p_session_id:ids.oldSession,p_historical_reason:'Session historique confirmée'})).error,null);
 // The historical materialization fixture predates the explicit contractual-party field.
 // A human choice is required before generation; never infer the party from funding.
 assert.equal((await post()).status,400);
 assert.equal(storage.size,0);
 await h.q("update daily_session_enrolments set contracting_party_type='individual'");
 const before=(await h.q('select decision_status,formation_id,attached_session_id from daily_formation_registration_requests where id=$1',[ids.request])).rows[0];
 const first=await post();assert.equal(first.status,200,JSON.stringify(await first.clone().json()));const documents=(await first.json()).documents;
 assert.equal(documents.length,6);assert.ok(documents.every(d=>d.created_by===ids.agent&&d.status==='to_check'));
 assert.equal(documents.filter(d=>d.document_type==='training_contract').length,1);assert.equal(documents.filter(d=>d.document_type==='training_agreement').length,0);assert.equal(audits.length,1);
 const second=await post();assert.equal(second.status,200);assert.equal((await h.q('select count(*)::int as n from daily_documents')).rows[0].n,6);assert.equal(storage.size,6);
 assert.deepEqual((await h.q('select decision_status,formation_id,attached_session_id from daily_formation_registration_requests where id=$1',[ids.request])).rows[0],before);
 const visibility=loadTypeScript('lib/server/dailyPortalResourceVisibility.ts');const enrolment=(await h.q('select * from daily_session_enrolments')).rows[0];
 const input=d=>({resource:d,role:'learner',sessionId:ids.oldSession,enrolmentIds:[enrolment.id],learnerIds:[enrolment.learner_id]});
 for(const d of documents){assert.equal(visibility.isDailyPortalResourceVisible(input(d)),false);assert.equal(visibility.isDailyPortalResourceVisible(input({...d,status:'validated'})),false);assert.equal(visibility.isDailyPortalResourceVisible(input({...d,status:'published'})),true);}
 await t.test('portail : contrat privé par inscription et convention privée par entreprise',()=>{const contract=documents.find(d=>d.document_type==='training_contract');assert.equal(visibility.isDailyPortalResourceVisible({...input({...contract,status:'published'}),enrolmentIds:['another-enrolment']}),false);const agreement={status:'published',document_type:'training_agreement',linked_object_type:'session',linked_object_id:ids.oldSession,metadata:{company_name:'Entreprise A'}};assert.equal(visibility.isDailyPortalResourceVisible({resource:agreement,role:'enterprise',sessionId:ids.oldSession,companyName:'Entreprise A'}),true);assert.equal(visibility.isDailyPortalResourceVisible({resource:agreement,role:'enterprise',sessionId:ids.oldSession,companyName:'Entreprise B'}),false);assert.equal(visibility.isDailyPortalResourceVisible({...input(agreement)}),false);});
 await t.test('le modèle HTML personnalisé est réellement utilisé, avec variables échappées',async()=>{const path=`daily/${ids.org}/templates/training_contract/client.doc`;storage.set(path,Buffer.from('<html><body>Modèle OF · {{BENEFICIAIRE}} · {{FORMATION}}</body></html>'));const result=await template.renderDailyPretrainingTemplate({admin,organisationId:ids.org,template:{id:'model',template_version:2,template_name:'Contrat OF',storage_path:path},variables:{BENEFICIAIRE:'Alice & Test',FORMATION:'Formation'},html:'ignored'});assert.match(Buffer.from(result.bytes).toString(),/Modèle OF · Alice &amp; Test/);assert.equal(result.metadata.template_id,'model');assert.equal(result.metadata.requires_template_completion,false);});
 await t.test('un modèle PDF non rempli exige une reprise manuelle avant validation',async()=>{const path=`daily/${ids.org}/templates/training_contract/client.pdf`;storage.set(path,Buffer.from('%PDF-template'));const r=await template.renderDailyPretrainingTemplate({admin,organisationId:ids.org,template:{id:'model',template_version:1,template_name:'PDF OF',storage_path:path},variables:{},html:'ignored'});assert.equal(r.mimeType,'application/pdf');assert.equal(r.metadata.requires_template_completion,true);});
 await t.test('un vrai modèle DOCX conserve sa mise en page et remplit ses variables',async()=>{const PizZip=require('pizzip');const zip=new PizZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Contrat OF {{BENEFICIAIRE}} {{FORMATION}}</w:t></w:r></w:p></w:body></w:document>');const path=`daily/${ids.org}/templates/training_contract/client.docx`;storage.set(path,zip.generate({type:'nodebuffer'}));const r=await template.renderDailyPretrainingTemplate({admin,organisationId:ids.org,template:{id:'word-model',template_version:3,template_name:'Word OF',storage_path:path},variables:{BENEFICIAIRE:'Alice QA',FORMATION:'Formation QA'},html:'ignored'});assert.equal(r.extension,'docx');assert.match(new PizZip(r.bytes).file('word/document.xml').asText(),/Contrat OF Alice QA Formation QA/);assert.equal(r.metadata.requires_template_completion,false);});
 await t.test('aucun modèle d’un autre OF n’est téléchargé',async()=>{await assert.rejects(template.renderDailyPretrainingTemplate({admin,organisationId:ids.org,template:{storage_path:`daily/${ids.foreignOrg}/templates/file.doc`},variables:{},html:''}),/périmètre/);});

 // The regression fixture mirrors the blocking shape, with synthetic people:
 // one explicit contractual party plus three NULL choices in a historical session.
 const plain=value=>JSON.parse(JSON.stringify(value));
 async function seedSession(number,parties,companies=[]){
  const baseSession=plain((await h.q('select * from daily_sessions where id=$1',[ids.oldSession])).rows[0]);
  const baseLearner=plain((await h.q('select * from daily_learners limit 1')).rows[0]);
  const baseEnrolment=plain((await h.q('select * from daily_session_enrolments limit 1')).rows[0]);
  const session=plain(await h.insert('daily_sessions',{...baseSession,id:uuid(number),companies}));
  const enrolments=[];
  for(let i=0;i<parties.length;i++){
   const learner=plain(await h.insert('daily_learners',{...baseLearner,id:uuid(number+i+1),first_name:`QA ${number+i}`,last_name:'Participant',email:`learner-${number+i}@example.test`}));
   enrolments.push(plain(await h.insert('daily_session_enrolments',{...baseEnrolment,id:uuid(number+i+20),session_id:session.id,learner_id:learner.id,contracting_party_type:parties[i].party,company_name:parties[i].company??null})));
  }
  return{session,enrolments};
 }
 async function existingConvention(session,company){
  const path=`daily/${ids.org}/session/${session.id}/existing-convention.doc`,content=Buffer.from('Convention existante à conserver');storage.set(path,content);
  return h.insert('daily_documents',{organisation_id:ids.org,session_id:session.id,formation_id:ids.oldFormation,document_type:'training_agreement',linked_object_type:'session',linked_object_id:session.id,version:1,status:'published',logical_name:'convention-existante',bucket:'documents',storage_path:path,mime_type:'application/msword',sha256:createHash('sha256').update(content).digest('hex'),size_bytes:content.length,metadata:{company_name:company}});
 }

 await t.test('un dossier prêt est généré malgré trois choix manquants : seules ses pièces et les pièces communes sont créées',async()=>{
  const f=await seedSession(200,[{party:'individual'},{party:null},{party:null},{party:null}]);const ready=f.enrolments[0];
  const preserved=await existingConvention(f.session,'Autre entreprise');
  const beforeStorage=storage.size;
  assert.equal((await post({session_id:f.session.id})).status,400);assert.equal(storage.size,beforeStorage);
  const args={session_id:f.session.id,enrolment_id:ready.id,expected_enrolment_updated_at:ready.updated_at};
  const response=await post(args);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));const body=await response.json();
  assert.equal(body.enrolment_id,ready.id);assert.equal(body.documents.length,6);assert.equal(storage.size,beforeStorage+6);
  const docs=(await h.q('select * from daily_documents where session_id=$1',[f.session.id])).rows;
  assert.equal(docs.length,7);assert.equal(docs.filter(d=>d.linked_object_type==='session').length,4);
  assert.ok(docs.filter(d=>d.linked_object_type==='enrolment').every(d=>d.enrolment_id===ready.id));
  assert.ok(body.documents.every(d=>d.created_by===ids.agent&&d.status==='to_check'));
  assert.equal(docs.find(d=>d.id===preserved.id).status,'published');assert.equal(docs.find(d=>d.id===preserved.id).is_current,true);
  assert.equal((await h.q('select count(*)::int as n from daily_session_enrolments where session_id=$1 and contracting_party_type is null',[f.session.id])).rows[0].n,3);
  assert.equal(audits.at(-1).metadata.enrolment_id,ready.id);
  assert.equal((await post(args)).status,200);assert.equal(storage.size,beforeStorage+6);assert.equal((await h.q('select count(*)::int as n from daily_documents where session_id=$1',[f.session.id])).rows[0].n,7);
 });

 await t.test('cible étrangère, choix absent, version périmée et demande de régénération ne créent aucune pièce',async()=>{
  const f=await seedSession(250,[{party:'individual'},{party:null}]);const ready=f.enrolments[0];const count=storage.size;
  const args={session_id:f.session.id,enrolment_id:ready.id,expected_enrolment_updated_at:ready.updated_at};
  for(const [override,status]of[
   [{enrolment_id:null},400],[{enrolment_id:''},400],[{expected_enrolment_updated_at:''},400],[{only_missing:false},400],
   [{enrolment_id:enrolment.id},404],[{expected_enrolment_updated_at:'stale'},409],
   [{enrolment_id:f.enrolments[1].id,expected_enrolment_updated_at:f.enrolments[1].updated_at},400],
   [{session_id:ids.foreignSession},400],
  ])assert.equal((await post({...args,...override})).status,status,JSON.stringify(override));
  await h.q("update daily_sessions set status='archived' where id=$1",[f.session.id]);assert.equal((await post(args)).status,404);
  assert.equal(storage.size,count);assert.equal((await h.q('select count(*)::int as n from daily_documents where session_id=$1',[f.session.id])).rows[0].n,0);
 });

 await t.test('convention ciblée : conserve les participants du commanditaire et la convention publiée d’un autre commanditaire',async()=>{
  const f=await seedSession(300,[{party:'company',company:'Entreprise A'},{party:'company',company:'Entreprise A'},{party:'company',company:'Entreprise B'},{party:null}],[{name:'Entreprise A',siret:'12345678901234'},{name:'Entreprise B',siret:'22345678901234'}]);
  const preserved=await existingConvention(f.session,'Entreprise B'),ready=f.enrolments[0];
  const response=await post({session_id:f.session.id,enrolment_id:ready.id,expected_enrolment_updated_at:ready.updated_at});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));const body=await response.json();
  assert.equal(body.documents.length,6);const agreement=body.documents.find(d=>d.document_type==='training_agreement');assert.equal(agreement.metadata.company_name,'Entreprise A');
  const html=storage.get(agreement.storage_path).toString();assert.match(html,/QA 300 Participant/);assert.match(html,/QA 301 Participant/);assert.doesNotMatch(html,/QA 302 Participant|QA 303 Participant/);
  const docs=(await h.q('select * from daily_documents where session_id=$1',[f.session.id])).rows;
  assert.ok(docs.filter(d=>d.linked_object_type==='enrolment').every(d=>d.enrolment_id===ready.id));assert.equal(docs.find(d=>d.id===preserved.id).status,'published');assert.equal(docs.find(d=>d.id===preserved.id).is_current,true);
 });

 await t.test('confirmation absente, agent désactivé et session étrangère refusés sans nouvelle pièce',async()=>{assert.equal((await post({confirm_delegated:false})).status,400);assert.equal((await post({session_id:ids.foreignSession})).status,400);await h.db.exec('update agent_profiles set is_active=false');assert.equal((await post()).status,403);assert.equal((await h.q('select count(*)::int as n from daily_documents where session_id=$1',[ids.oldSession])).rows[0].n,6);});
});
