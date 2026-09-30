import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function compile(path, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Blob, TextEncoder, crypto: globalThis.crypto, require: name => { if (!(name in dependencies)) throw Error(`Unexpected dependency ${name}`); return dependencies[name]; }, console, URL });
  return exports;
}
const helper = compile('lib/dailyContractingParty.ts');
const { resolveContractingPartyType: resolve, validateContractingParty: validate } = helper;

test('canonical choice overrides SIRET and funding on each session of the same learner', () => {
  const learner = { id: 'learner', siret: '12345678901234' };
  const first = { learner_id: learner.id, session_id: 'one', contracting_party_type: 'individual', funding_type: 'employer' };
  const second = { learner_id: learner.id, session_id: 'two', contracting_party_type: 'company', company_name: 'Sponsor', funding_type: 'self_funded' };
  assert.equal(resolve(first, learner.siret), 'individual');
  assert.equal(resolve(second, ''), 'company');
  assert.equal(resolve(first, ''), 'individual');
  assert.equal(resolve(second, learner.siret), 'company');
});
test('historical missing/null choices retain the previous client SIRET rule', () => {
  for (const row of [{}, { contracting_party_type: null }]) {
    assert.equal(resolve(row, ''), 'individual');
    assert.equal(resolve(row, '12345678901234'), 'company');
    assert.equal(validate(row, false), null);
  }
});
test('manual creation requires an explicit choice and company requires a sponsor', () => {
  for (const value of [undefined, null, '', 'employer', 'COMPANY']) assert.ok(validate({ contracting_party_type: value }));
  assert.ok(validate({ contracting_party_type: 'company', company_name: '  ' }));
  assert.equal(validate({ contracting_party_type: 'company', company_name: 'Sponsor' }), null);
  assert.equal(validate({ contracting_party_type: 'individual' }), null);
});
function fixture() {
  const rows = [];
  let accessCalls = 0;
  const admin = { from(table) {
    let payload, operation, filters = {};
    const query = {
      select() { return query; }, eq(k,v) { filters[k]=v; return query; },
      insert(data) { operation='insert'; payload=data; return query; },
      update(data) { operation='update'; payload=data; return query; },
      async maybeSingle() { return { data: table === 'daily_session_enrolments' ? rows.find(row=>Object.entries(filters).every(([k,v])=>row[k]===v)) : { id:'owned' }, error:null }; },
      async single() {
        if(operation==='insert') { const row={id:`e${rows.length}`, ...payload}; rows.push(row); return {data:row,error:null}; }
        const row=rows.find(row=>Object.entries(filters).every(([k,v])=>row[k]===v)); Object.assign(row,payload); return {data:row,error:null};
      }
    }; return query;
  }};
  const route = compile('app/api/client/daily/learners/route.ts', {
    '@/lib/dailyContractingParty': helper,
    'next/server': {NextResponse:{json:(body,options={})=>({body,status:options.status??200})}},
    '@/lib/server/dailyOrganisationContext': {getDailyOrganisationContext:async()=>({ok:true,admin,organisationId:'org',user:{id:'user'}})},
    '@/lib/server/dailyLearnerPortalAccess': {ensureAndSendLearnerPortalAccess:async()=>{accessCalls++;return {status:'mocked'};}},
    '@/lib/server/agentAssistance': {logAgentAssistanceAction:async()=>{}}
  });
  const request=body=>({url:'https://local.test/api',json:async()=>body});
  return { rows, post:body=>route.POST(request({action:'enrolment',learner_id:'same',...body})), patch:body=>route.PATCH(request(body)), accessCalls:()=>accessCalls };
}
test('API persists two session-specific choices and edits only the selected enrolment', async () => {
  const f=fixture();
  assert.equal((await f.post({session_id:'one',contracting_party_type:'individual'})).status,200);
  assert.equal((await f.post({session_id:'two',contracting_party_type:'company',company_name:'Sponsor'})).status,200);
  assert.equal(f.rows[0].learner_id,f.rows[1].learner_id);
  assert.equal(f.rows[0].contracting_party_type,'individual');
  assert.equal(f.rows[1].contracting_party_type,'company');
  assert.equal((await f.patch({id:'e1',contracting_party_type:'individual'})).status,200);
  assert.equal(f.rows[0].contracting_party_type,'individual');
  assert.equal(f.rows[1].contracting_party_type,'individual');
  assert.equal(f.accessCalls(),2); // Stub only: no transport or email service imported.
});
test('API rejects invalid changes, requires sponsor, preserves omitted historical choice', async () => {
  const f=fixture();
  for(const contracting_party_type of [undefined,null,'invalid','company']) assert.equal((await f.post({session_id:'one',contracting_party_type})).status,400);
  assert.equal(f.rows.length,0);assert.equal(f.accessCalls(),0);
  await f.post({session_id:'one',contracting_party_type:'company',company_name:'Sponsor'});
  assert.equal((await f.patch({id:'e0',company_name:' '})).status,400);
  assert.equal((await f.patch({id:'e0',contracting_party_type:null})).status,400);
  f.rows[0].contracting_party_type=null;
  assert.equal((await f.patch({id:'e0',status:'confirmed'})).status,200);
  assert.equal(f.rows[0].contracting_party_type,null);
  assert.equal((await f.patch({id:'e0',contracting_party_type:'company',company_name:'New sponsor'})).status,200);
});
test('both generators consume canonical enrolment choice and Studio reads it through assisted API', () => {
  const server=read('app/api/client/daily/pretraining-documents/route.ts');
  assert.match(server,/resolveContractingPartyType\(enrolment,company\?\.siret\)/);
  assert.match(server,/resolveContractingPartyType\(e,company.siret\)/);
  assert.ok(server.indexOf('Renseignez l’entreprise') < server.indexOf('const created:any[]'));
  const client=read('app/client/daily/generateur-documents/page.tsx');
  assert.match(client,/row.session_id===session.id&&recipient.id===`learner:\$\{row.learner_id\}`/);
  assert.match(client,/resolveContractingPartyType\(enrolment\?\?\{\},clientSiret\)/);
  assert.match(read('app/api/client/daily/learners/route.ts'),/allowAssistanceRead:true/);
  assert.match(read('app/api/client/daily/learner-shared-documents/route.ts'),/contracting_party_type,company_name/);
  assert.match(read('app/client/daily/apprenants/page.tsx'),/contracting_party_type:f.get\("contracting_party_type"\)/);
});
test('migration is additive, nullable, constrained and does not alter historical data or RLS', () => {
  const sql=read('supabase/migrations/20260930211806_daily_enrolment_contracting_party_type.sql');
  assert.match(sql,/ADD COLUMN contracting_party_type text/);
  assert.match(sql,/IN \('individual', 'company'\)/);
  assert.match(sql,/NULLIF\(btrim\(company_name\), ''\) IS NOT NULL/);
  assert.doesNotMatch(sql,/\b(DROP|UPDATE|DELETE|POLICY|GRANT|REVOKE|TRIGGER|DEFAULT)\b|auth\./);
});

async function generateDocuments(enrolments, companies) {
  const documents=[];
  const rendered=[];
  const renderers={};
  for(const name of ['TrainingProgram','TrainingAgreement','TrainingContract','Convocation','RegistrationPositioning','WelcomeBooklet','InternalRegulations']) renderers[`build${name}Html`]=(_common,args)=>{rendered.push({name,...args});return JSON.stringify({name,...args});};
  const admin={storage:{from:()=>({upload:async()=>({error:null})})},from(table){
    let inserted;
    const result=()=>({data: table==='daily_sessions'?{id:'session',companies,daily_formations:{title:'Formation'}}:table==='daily_session_enrolments'?enrolments:table==='organisations'?{}:table==='daily_documents'&&inserted?inserted:[],error:null});
    const q={select(){return q},eq(){return q},in(){return q},not(){return q},order(){return q},limit(){return q},insert(row){inserted=row;documents.push(row);return q},single:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};
    return q;
  }};
  const route=compile('app/api/client/daily/pretraining-documents/route.ts',{
    '@/lib/dailyContractingParty':helper,
    'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status??200})}},
    '@/lib/server/dailyOrganisationContext':{getDailyOrganisationContext:async()=>({ok:true,admin,organisationId:'org',user:{id:'user'}})},
    '@/lib/server/dailyPretrainingDocumentHtml':renderers
  });
  const response=await route.POST({json:async()=>({session_id:'session'})});
  return {response,documents,rendered};
}
test('document generation separates mixed parties at the same company despite its SIRET',async()=>{
  const {response,documents,rendered}=await generateDocuments([
    {id:'individual',contracting_party_type:'individual',company_name:'Sponsor',daily_learners:{first_name:'Alice'}},
    {id:'company',contracting_party_type:'company',company_name:'Sponsor',daily_learners:{first_name:'Bob'}}
  ],[{name:'Sponsor',siret:'12345678901234'}]);
  assert.equal(response.status,200);
  const contracts=documents.filter(d=>d.document_type==='training_contract');
  assert.equal(contracts.length,1);assert.equal(contracts[0].enrolment_id,'individual');
  const agreements=documents.filter(d=>d.document_type==='training_agreement');
  assert.equal(agreements.length,1);
  assert.equal(rendered.find(row=>row.name==='TrainingAgreement').learnerNames,'Bob');
});
test('company without SIRET generates a convention; missing sponsor blocks all generation',async()=>{
  const row={id:'company',contracting_party_type:'company',company_name:'Sponsor',daily_learners:{first_name:'Bob'}};
  const valid=await generateDocuments([row],[{name:'Sponsor'}]);
  assert.equal(valid.response.status,200);
  assert.equal(valid.documents.filter(d=>d.document_type==='training_agreement').length,1);
  assert.equal(valid.documents.filter(d=>d.document_type==='training_contract').length,0);
  const invalid=await generateDocuments([row],[]);
  assert.equal(invalid.response.status,400);assert.equal(invalid.documents.length,0);
});
test('historical generation retains agreement with SIRET and contract without SIRET',async()=>{
  const row={id:'historical',company_name:'Sponsor',daily_learners:{first_name:'Alice'}};
  for(const siret of ['', '12345678901234']) {
    const {response,documents}=await generateDocuments([row],[{name:'Sponsor',siret}]);
    assert.equal(response.status,200);
    const contractual=documents.filter(d=>['training_contract','training_agreement'].includes(d.document_type));
    assert.equal(contractual.length,1);
    assert.equal(contractual[0].document_type,siret?'training_agreement':'training_contract');
  }
});
