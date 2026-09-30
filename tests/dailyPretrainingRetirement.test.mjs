import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(path, dependencies = {}) {
  const exports = {};
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports, Error, Blob, TextEncoder, crypto:globalThis.crypto, URL, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; }});
  return exports;
}
const helper = compile('lib/dailyContractingParty.ts');
const enrolment = (id, party, company = 'A') => ({id,organisation_id:'org',session_id:'session',status:'confirmed',contracting_party_type:party,company_name:company,daily_learners:{first_name:id}});
const contract = (id = 'old-contract', learner = 'one') => ({id,organisation_id:'org',session_id:'session',document_type:'training_contract',linked_object_type:'enrolment',linked_object_id:learner,logical_name:'contrat-formation-apprenant',version:1,is_current:true,status:'signed',storage_path:'retained.doc',signature_id:'signature',metadata:{}});
const agreement = (company = 'A') => ({...contract(`agreement-${company}`),document_type:'training_agreement',linked_object_type:'session',linked_object_id:'session',logical_name:`convention-${company.toLowerCase()}`,metadata:{company_name:company,client_siret:'123'}});
function fixture({enrolments = [enrolment('one','company')],companies = [{name:'A',siret:'123'}],documents = [contract()],failure} = {}) {
  const rows = structuredClone(documents), calls = [], uploads = [];
  const tables = {daily_documents:rows,daily_sessions:[{id:'session',organisation_id:'org',companies,daily_formations:{}}],daily_session_enrolments:enrolments,daily_enrolment_support_needs:[],organisations:[{id:'org'}],daily_trainer_profiles:[]};
  let sequence = 0;
  const admin = {storage:{from(bucket) { assert.equal(bucket,'documents'); return {async upload(path) { uploads.push(path); return {error:failure==='upload'||(failure==='late-upload' && path.includes('/convocation/'))?{message:'upload failed'}:null}; },async remove() {return {error:null};}}; }},from(table) {
    assert.ok(table in tables, table);
    let operation = 'select', payload, single = false, limit, ordering;
    const filters = [];
    const q = {
      select() {return q;}, eq(key,value) {filters.push({key,value,kind:'eq'});return q;}, in(key,value) {filters.push({key,value:[...value],kind:'in'});return q;},
      not(key,operator,value) {assert.equal(operator,'in');filters.push({key,value:value.slice(1,-1).split(','),kind:'not'});return q;},
      order(key,options) {ordering={key,...options};return q;}, limit(n) {limit=n;return q;}, single() {single=true;return q;},
      insert(row) {operation='insert';payload=row;return q;}, update(row) {operation='update';payload=row;return q;},
      then(resolve,reject) {return Promise.resolve().then(()=> {
        calls.push({table,operation,filters:structuredClone(filters),payload});
        const retirement = table==='daily_documents' && operation==='update' && filters.some(f=>f.key==='document_type' && f.kind==='in');
        const snapshot = table==='daily_documents' && operation==='select' && filters.some(f=>f.key==='document_type' && f.kind==='in');
        if ((failure==='read'&&snapshot)||(failure==='retire'&&retirement)||(failure==='insert'&&operation==='insert')) return {data:null,error:{message:`${failure} failed`}};
        let selected = tables[table].filter(row=>filters.every(f=>f.kind==='eq'?row[f.key]===f.value:f.kind==='in'?f.value.includes(row[f.key]):!f.value.includes(row[f.key])));
        if(ordering) selected.sort((a,b)=>ordering.ascending?a[ordering.key]-b[ordering.key]:b[ordering.key]-a[ordering.key]);
        if(limit) selected=selected.slice(0,limit);
        if(operation==='insert') {const row={id:`generated-${++sequence}`,...payload};rows.push(row);selected=[row];}
        if(operation==='update') selected.forEach(row=>Object.assign(row,payload));
        return {data:single?selected[0]:selected,error:null};
      }).then(resolve,reject);}
    };return q;
  }};
  const renderers = Object.fromEntries(['TrainingProgram','TrainingAgreement','TrainingContract','Convocation','RegistrationPositioning','WelcomeBooklet','InternalRegulations'].map(name=>[`build${name}Html`,()=> {if(failure==='render'&&name==='Convocation') throw Error('render failed');return name;}]));
  const route = compile('app/api/client/daily/pretraining-documents/route.ts',{'@/lib/dailyContractingParty':helper,'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status??200})}},'@/lib/server/dailyOrganisationContext':{getDailyOrganisationContext:async()=>({ok:true,admin,organisationId:'org',user:{id:'user'}})},'@/lib/server/dailyPretrainingDocumentHtml':renderers});
  return {rows,calls,uploads,post:()=>route.POST({json:async()=>({session_id:'session'})})};
}
const current = (f,type) => f.rows.filter(row=>row.is_current&&row.document_type===type);

test('individual -> company retires signed contract only after all generations with persistent scope',async()=>{
  const original=contract(), f=fixture({documents:[original]});
  assert.equal((await f.post()).status,200);
  assert.equal(f.rows[0].is_current,false);
  assert.deepEqual(f.rows[0],{...original,is_current:false,updated_by:'user'});
  assert.equal(current(f,'training_agreement').length,1);
  const updates=f.calls.filter(c=>c.operation==='update');
  assert.equal(updates.length,1);
  assert.deepEqual(updates[0].filters,[{key:'organisation_id',value:'org',kind:'eq'},{key:'session_id',value:'session',kind:'eq'},{key:'document_type',value:['training_contract','training_agreement'],kind:'in'},{key:'is_current',value:true,kind:'eq'},{key:'id',value:['old-contract'],kind:'in'}]);
  assert.equal(f.calls.at(-1),updates[0]);
});
test('company -> individual retires unnecessary agreement and creates contract',async()=>{
  const f=fixture({enrolments:[enrolment('one','individual')],documents:[agreement()]});
  assert.equal((await f.post()).status,200);assert.equal(f.rows[0].is_current,false);assert.equal(current(f,'training_contract').length,1);assert.equal(current(f,'training_agreement').length,0);
});
test('sponsor A -> B retires A when absent from canonical companies',async()=>{
  const f=fixture({enrolments:[enrolment('one','company','B')],companies:[{name:'B',siret:'456'}],documents:[agreement()]});
  assert.equal((await f.post()).status,200);assert.equal(f.rows[0].is_current,false);assert.equal(current(f,'training_agreement')[0].metadata.company_name,'B');
});
test('same sponsor name with changed SIRET replaces old agreement after success',async()=>{
  const f=fixture({companies:[{name:'A',siret:'456'}],documents:[agreement()]});
  assert.equal((await f.post()).status,200);assert.equal(f.rows[0].is_current,false);assert.equal(current(f,'training_agreement').length,1);assert.equal(current(f,'training_agreement')[0].metadata.client_siret,'456');
});
test('A still needed by another learner remains represented in current agreements',async()=>{
  const f=fixture({enrolments:[enrolment('one','individual'),enrolment('two','company')],documents:[agreement()]});
  assert.equal((await f.post()).status,200);assert.equal(current(f,'training_agreement').length,1);assert.equal(current(f,'training_agreement')[0].metadata.company_name,'A');
});
test('historical NULL, unregistered companies/participants and foreign or noncontractual documents preserved',async()=>{
  const protectedRows=[{...contract('foreign-org'),organisation_id:'other'},{...contract('foreign-session'),session_id:'other'}, {...contract('program'),document_type:'training_program',logical_name:'other-program'},contract('historical-participant','unregistered')];
  const f=fixture({enrolments:[enrolment('one',null),enrolment('individual-history',null,'No SIRET')],companies:[{name:'A',siret:'123'},{name:'No SIRET'},{name:'Historical',siret:'789'}],documents:[...protectedRows,agreement()]});
  assert.equal((await f.post()).status,200);assert.deepEqual(f.rows.slice(0,protectedRows.length),protectedRows);
  assert.deepEqual(current(f,'training_agreement').map(row=>row.metadata.company_name).sort(),['A','Historical']);
  assert.ok(current(f,'training_contract').some(row=>row.enrolment_id==='individual-history'));
});
test('invalid company validation leaves opposite document current without uploads',async()=>{
  const f=fixture({companies:[]});assert.equal((await f.post()).status,400);assert.equal(f.rows[0].is_current,true);assert.equal(f.uploads.length,0);
});
for(const failure of ['read','upload','late-upload','insert','render']) test(`${failure} error preserves opposite and replaced contractual documents`,async()=>{
  for(const config of [{documents:[contract()]},{enrolments:[enrolment('one','individual')],documents:[agreement()]},{companies:[{name:'A',siret:'456'}],documents:[agreement()]}]) {
    const f=fixture({...config,failure}), response=await f.post();assert.equal(response.status,400);assert.match(response.body.error,/failed/);assert.equal(f.rows[0].is_current,true);assert.equal(f.calls.filter(c=>c.operation==='update').length,0);
  }
});
test('retirement failure propagates without false success',async()=>{
  const f=fixture({failure:'retire'}), response=await f.post();assert.equal(response.status,400);assert.equal(response.body.error,'retire failed');assert.equal(f.rows[0].is_current,true);assert.equal(response.body.documents,undefined);
});
