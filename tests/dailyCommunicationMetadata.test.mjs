import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const helper = 'lib/daily/communicationMetadata.ts';
const context = 'lib/server/dailyOrganisationContext.ts';
const route = name => `app/api/client/daily/${name}/route.ts`;
const allowed = new Set([helper, context, ...['communications', 'session-dossiers', 'pretraining-documents/download'].map(route)]);
const privateBytes = 'PRIVATE_FILE_SENTINEL';
const json = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function harness({ rows = [], capabilities = { sessions: true, trainings: true }, refused = false } = {}) {
  const db = {
    daily_communications: rows,
    daily_sessions: [{ id: 'session', organisation_id: 'org', formation_id: 'formation', status: 'active' }],
    daily_session_dossiers: [{ session_id: 'session', organisation_id: 'org', status: 'in_progress' }],
    daily_session_checklist_items: [{ id: 'check', session_id: 'session', organisation_id: 'org', responsibility: 'client', position: 1 }],
    daily_documents: [{ id: 'document', session_id: 'session', organisation_id: 'org', is_current: true, version: 3, metadata: { business: true } }],
    daily_formations: [{ id: 'formation', title: 'Formation' }],
    daily_convention_signatures: [{ id: 'signature', session_id: 'session', status: 'signed' }],
    daily_mission_orders: [{ id: 'mission', organisation_id: 'org', session_ids: ['session'] }],
    daily_mission_order_signatures: [{ id: 'mission-signature', mission_order_id: 'mission' }],
    daily_communication_documents: rows.map(r => ({ communication_id: r.id, document_id: 'document', document_type: 'convocation', logical_name: 'Convocation', document_version: 3, sha256: 'hash', storage_path: 'original.pdf', created_at: '2026-10-02' })),
  };
  const canonical = {
    enrolments: 'daily_session_enrolments', portalAccess: 'daily_portal_access_tokens',
    attendanceSlots: 'daily_attendance_slots', attendanceRecords: 'daily_attendance_records',
    assessments: 'daily_learning_assessments', learnerFeedback: 'daily_learner_feedback_responses',
    stakeholderFeedback: 'daily_stakeholder_satisfaction_responses',
  };
  for (const table of Object.values(canonical)) db[table] = [{ id: table, session_id: 'session', organisation_id: 'org' }];
  freeze(db);
  const calls = [];
  const admin = { from(table) {
    assert.ok(Object.hasOwn(db, table), `Forbidden table ${table}`);
    const call = { table, filters: [] }; calls.push(call);
    const q = {
      select(columns) { assert.equal(call.columns, undefined); call.columns = columns.split(','); return q; },
      eq(k,v) { call.filters.push(['eq',k,v]); return q; },
      neq(k,v) { call.filters.push(['neq',k,v]); return q; },
      not(k,op,v) { assert.equal(op,'is'); assert.equal(v,null); call.filters.push(['not',k,v]); return q; },
      in(k,v) { call.filters.push(['in',k,v]); return q; },
      overlaps(k,v) { call.filters.push(['overlaps',k,v]); return q; },
      order(k,options) { (call.orders ??= []).push([k,options]); return q; },
      limit(n) { call.limit=n; return q; },
      then(resolve,reject) { return Promise.resolve().then(() => {
        assert.ok(call.columns, 'select required');
        const data = db[table].filter(r => call.filters.every(([op,k,v]) => {
          if(op==='eq') return r[k]===v;
          if(op==='neq') return r[k]!==v;
          if(op==='not') return r[k]!=null;
          if(op==='in') return v.includes(r[k]);
          if(op==='overlaps') return r[k].some(x=>v.includes(x));
          assert.fail(op);
        })).slice(0,call.limit).map(r => Object.fromEntries(call.columns.filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]])));
        // Metadata retains the exact frozen DB reference: mutation cannot hide behind a cloned fixture.
        return { data, error: null };
      }).then(resolve,reject); },
    };
    return q;
  } };
  const cache = {};
  function load(path) {
    assert.ok(allowed.has(path), `Forbidden production import ${path}`);
    if(cache[path]) return cache[path];
    const module = { exports: {} };
    const fail = () => { throw new Error('Forbidden Auth/network/mutation'); };
    const mocks = {
      'next/server': { NextResponse: { json: (body,init) => Response.json(body,init) } },
      '@/lib/server/clientNdaAccess': { getAdminSupabase: () => admin },
      '@/lib/server/agentAssistance': { getAssistedClientUser: async () => null, getAssistanceTokenFromRequest: fail, blockedAgentAssistanceResponse: fail },
      '@/lib/server/dailyClientWorkspace': { getDailyClientWorkspace: async () => refused ? { ok:false, status:401, error:'refused' } : { ok:true, user:{id:'user'}, workspace:{ capabilities, membership:{organisation_id:'org'} } } },
      '@/lib/server/dailySessionCompletion': { reconcileDailySessionDossier: fail },
    };
    const code = ts.transpileModule(fs.readFileSync(path,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports:module.exports, URL, fetch:fail, require(name) {
      if(Object.hasOwn(mocks,name)) return mocks[name];
      if(name.startsWith('@/')) return load(name.slice(2)+'.ts');
      throw new Error(`Forbidden import ${name}`);
    } }, {filename:path});
    return cache[path] = module.exports;
  }
  return { db, calls, canonical, load, get: name => load(route(name)).GET(new Request(`https://fixture.test/?session_id=session&id=document`)) };
}
function communication(source, status, metadata) {
  return { id:`${source}-${status}`, organisation_id:'org', session_id:'session', communication_type:'convocation', status,
    subject:'Original subject', text_body:'Original text', provider:'resend', provider_message_id:'provider-id', sent_at:'2026-10-02', delivered_at:null, failed_at:null,
    metadata: metadata ?? { source, document_id:'document', convocation_id:'legacy', document_version:3, storage_path:'original.pdf', sha256:'hash', attempt:1,
      email_input:{attachmentBase64:privateBytes, prepared:{subject:'Transport subject', html:privateBytes}} } };
}
for(const name of ['communications','session-dossiers']) {
  for(const source of ['daily_documents','daily_convocations']) for(const status of ['queued','sent','pending']) {
    test(`${name}: ${source}/${status} projects only transport without mutating DB`, async () => {
      const row=communication(source,status); const h=harness({rows:[row]}); const before=json(h.db);
      const response=await h.get(name); assert.equal(response.status,200); const body=await response.json();
      const output=body.communications[0]; const {email_input,...business}=row.metadata;
      assert.deepEqual(output.metadata,business);
      for(const key of ['subject','status','provider','sent_at','delivered_at','failed_at']) assert.deepEqual(output[key],row[key]);
      if(name==='communications') { assert.equal(output.text_body,row.text_body); assert.equal(output.provider_message_id,row.provider_message_id); assert.deepEqual(output.documents,json(h.db.daily_communication_documents)); }
      else {
        const linked=h.calls.find(c=>c.table==='daily_communication_documents');
        assert.deepEqual(body.communicationDocuments,h.db.daily_communication_documents.map(r=>Object.fromEntries(linked.columns.map(k=>[k,r[k]]))));
        for(const [key,table] of Object.entries(h.canonical)) assert.equal(body.canonicalStates[key][0].id,table);
        assert.equal(body.documents[0].version,3); assert.deepEqual(body.documents[0].metadata,{business:true});
      }
      assert.doesNotMatch(JSON.stringify(body),/email_input|attachmentBase64|PRIVATE_FILE_SENTINEL/);
      assert.deepEqual(h.db,before); assert.equal(row.metadata.email_input,email_input);
      const query=h.calls.find(c=>c.table==='daily_communications');
      assert.ok(query.filters.some(f=>JSON.stringify(f)===JSON.stringify(['eq','organisation_id','org'])));
      assert.ok(query.filters.some(f=>JSON.stringify(f)===JSON.stringify(name==='communications'?['eq','session_id','session']:['not','session_id',null])));
      assert.equal(query.limit,name==='communications'?250:500);
      assert.deepEqual(h.calls.find(c=>c.table==='daily_communication_documents').filters,[['in','communication_id',[row.id]]]);
      if(name==='session-dossiers') for(const call of h.calls.filter(c=>Object.values(h.canonical).includes(c.table))) assert.ok(call.filters.some(f=>f[0]==='in' && f[1]==='session_id' && f[2][0]==='session'));
    });
  }
  test(`${name}: other families and absent/null/malformed metadata retain their contracts`,async()=>{
    const rows=[undefined,null,[],['original'],42,false,'original',{}].map((metadata,i)=>({ ...communication('daily_documents',String(i)), metadata }));
    delete rows[0].metadata;
    rows.push({...communication('daily_documents','other'),communication_type:'registration_confirmation'});
    const h=harness({rows}); const response=await h.get(name); assert.equal(response.status,200); const body=await response.json();
    rows.forEach((row,i)=>{
      assert.equal(Object.hasOwn(body.communications[i],'metadata'),Object.hasOwn(row,'metadata'));
      if(Object.hasOwn(row,'metadata')) assert.deepEqual(body.communications[i].metadata,row.metadata);
    });
  });
  for(const refused of [false,true]) test(`${name}: context refusal precedes DB access (${refused})`,async()=>{
    const h=harness({refused,capabilities:{sessions:false,trainings:false}}); const response=await h.get(name);
    assert.equal(response.status,refused?401:403); assert.equal(h.calls.length,0);
  });
}
test('Work reproduction: trainings-only dossier allowed, snapshot absent, download and communications remain forbidden',async()=>{
  const h=harness({capabilities:{trainings:true,sessions:false},rows:[communication('daily_documents','queued')]});
  const response=await h.get('session-dossiers'); assert.equal(response.status,200);
  assert.doesNotMatch(await response.text(),/email_input|attachmentBase64|PRIVATE_FILE_SENTINEL/);
  const count=h.calls.length;
  assert.equal((await h.get('pretraining-documents/download')).status,403);
  assert.equal((await h.get('communications')).status,403);
  assert.equal(h.calls.length,count);
  assert.equal(h.db.daily_communications[0].metadata.email_input.attachmentBase64,privateBytes);
});
test('pure projection preserves malformed values and other families by identity',()=>{
  const project=harness().load(helper).projectCommunicationMetadata;
  for(const value of [undefined,null,[],['original'],false,1,'original']) assert.equal(project('convocation',value),value);
  const metadata=freeze({email_input:{attachmentBase64:privateBytes},business:{version:3}});
  for(const family of ['registration_confirmation','document_notification','signature_reminder',undefined]) assert.equal(project(family,metadata),metadata);
  const output=project('convocation',metadata); assert.notEqual(output,metadata); assert.equal(output.business,metadata.business);
  assert.equal(Object.hasOwn(output,'email_input'),false); assert.equal(metadata.email_input.attachmentBase64,privateBytes);
});
for(const name of ['communications','session-dossiers']) test(`${name}: organisation and session scope exclude unrelated communications and links`,async()=>{
  const local=communication('daily_documents','sent');
  const foreign={...local,id:'foreign',organisation_id:'other'};
  const outside={...local,id:'outside',session_id:name==='communications'?'other':null};
  const h=harness({rows:[local,foreign,outside]}); const response=await h.get(name); assert.equal(response.status,200);
  const body=await response.json(); assert.deepEqual(body.communications.map(r=>r.id),[local.id]);
  const links=name==='communications'?body.communications[0].documents:body.communicationDocuments;
  assert.deepEqual(links.map(r=>r.communication_id),[local.id]);
});
