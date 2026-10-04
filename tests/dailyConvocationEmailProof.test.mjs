import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';

// Only these actual production modules may execute. No Auth, DB or network SDK.
const modules = new Set(['lib/server/dailyPretrainingEmails.ts', 'lib/server/dailyConvocationEmailProof.ts',
  'lib/server/dailySignedConventionPretrainingPack.ts', 'app/api/client/daily/pretraining-documents/send/route.ts']);
function harness(options = {}) {
  const enrolmentId = '11111111-1111-4111-a111-111111111111';
  const session = {id:'session',organisation_id:'org',status:'active',internal_reference:'REF',start_date:'2026-10-05',end_date:'2026-10-06',daily_formations:{title:'Formation <test>'}};
  const learner = {first_name:'Alice',last_name:'Nom',email:'alice@example.test'};
  const enrolment = {id:enrolmentId,organisation_id:'org',session_id:'session',status:'active',daily_learners:learner};
  const document = {id:'document',organisation_id:'org',document_type:'convocation',linked_object_type:'enrolment',linked_object_id:enrolmentId,version:1,status:'validated',logical_name:'Convocation',bucket:'daily-documents',storage_path:'original.doc',sha256:null,is_current:true};
  const convocation = {id:'convocation',session_id:'session',recipient_type:'learner',recipient_key:enrolmentId,recipient_name:'Alice Nom',recipient_email:learner.email,version:1,document_name:'convocation-original.doc',storage_path:'legacy-original.doc',status:'generated',sent_at:null,daily_sessions:session};
  const db = {daily_documents:[document],daily_sessions:[session],daily_session_enrolments:[enrolment],daily_communications:[],daily_communication_documents:[],daily_convocations:[convocation],daily_conventions:[{id:'convention',session_id:'session',recipient_type:'learner',recipient_key:enrolmentId,recipient_email:learner.email}],daily_convention_signatures:[{id:'sig',convention_id:'convention',status:'signed'}]};
  const calls=[],sends=[],downloads=[];
  let now = Date.parse('2026-10-02T10:00:00.000Z');
  class Clock extends Date { constructor(...args) {super(...(args.length ? args : [now]));} static now(){return now;} }
  const admin = {from(table) {
    assert.ok(Object.hasOwn(db,table),`Unexpected table ${table}`);
    let action='read',payload,filters=[],single=false,limit,order;
    const q={
      select(columns){assert.equal(typeof columns,'string');return q;},
      eq(k,v){filters.push(r=>r[k]===v);return q;},neq(k,v){filters.push(r=>r[k]!==v);return q;},
      contains(k,v){filters.push(r=>Object.entries(v).every(([key,value])=>r[k]?.[key]===value));return q;},
      order(k,{ascending}){order=[k,ascending];return q;},limit(n){limit=n;return q;},
      insert(v){assert.equal(table,'daily_communications');action='insert';payload=v;return q;},
      upsert(v,opts){assert.equal(table,'daily_communication_documents');assert.equal(opts.ignoreDuplicates,true);action='upsert';payload=v;return q;},
      update(v){assert.ok(['daily_communications','daily_convocations'].includes(table));action='update';payload=v;return q;},
      single(){single=true;return q;},maybeSingle(){single=true;return q;},
      then(resolve,reject){return Promise.resolve().then(()=>{
        calls.push({table,action,payload});
        const fault = action==='insert' ? options.claim : action==='upsert' ? options.snapshot
          : action==='update' && payload.status==='sent' ? (table==='daily_communications' ? options.finalize : options.projection) : null;
        if(fault==='throw') throw new Error('simulated persistence failure');
        if(fault) return {data:null,error:fault==='zero' ? null : {message:'simulated failure'}};
        if(action==='insert') {
          assert.match(payload.id,/^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-a[\da-f]{3}-[\da-f]{12}$/);
          if(db[table].some(r=>r.id===payload.id)) return {data:null,error:{code:'23505'}};
          db[table].push(structuredClone(payload));
          return {data:structuredClone(payload),error:null};
        }
        if(action==='upsert') {
          assert.ok(db.daily_documents.some(d=>d.id===payload.document_id),'real FK must point to daily_documents');
          if(!db[table].some(r=>r.communication_id===payload.communication_id && r.document_id===payload.document_id)) db[table].push(structuredClone(payload));
          return {data:null,error:null};
        }
        let rows=db[table].filter(r=>filters.every(f=>f(r)));
        if(order) rows.sort((a,b)=>(a[order[0]]-b[order[0]])*(order[1]?1:-1));
        if(limit) rows=rows.slice(0,limit);
        if(action==='update') rows.forEach(r=>{Object.assign(r,structuredClone(payload));if(options.postgresTime && r.sent_at)r.sent_at=r.sent_at.replace('Z','+00:00');});
        if(options.readProof && table==='daily_communications' && action==='read' && rows.some(r=>r.status==='sent')) return {data:null,error:{message:'read unavailable'}};
        return {data:structuredClone(single ? rows[0]??null : rows),error:null};
      }).then(resolve,reject);},
    };return q;
  },storage:{from(bucket){return {async download(path){downloads.push({bucket,path});if(options.download) throw new Error('download unavailable');return {data:{arrayBuffer:async()=>Buffer.from(options.bytes??'ORIGINAL BYTES')},error:null};}};}}};
  const cache={};
  function load(path) {
    assert.ok(modules.has(path),`Forbidden production import ${path}`);
    if(cache[path])return cache[path];
    const module={exports:{}};
    const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{module,exports:module.exports,Buffer,Date:Clock,console:{warn(){},error(){}},process:{env:{RESEND_API_KEY:options.noKey?'':'mock-only'}},fetch(){throw new Error('network forbidden');},require(name){
      if(name==='node:crypto')return crypto;
      if(name==='node:buffer')return {Buffer};
      if(name==='next/server')return {NextResponse:{json:(data,init)=>({status:init?.status??200,body:data})}};
      if(name==='@/lib/server/dailyOrganisationContext')return {getDailyOrganisationContext:async()=>options.unauthorized?{ok:false,status:403,error:'unauthorized'}:{ok:true,assisted:options.assisted,admin,organisationId:options.org??'org',user:{id:'user'}}};
      if(name==='resend')return {Resend:class {emails={send:async(message,sendOptions)=>{
        assert.ok(sendOptions.idempotencyKey);sends.push(structuredClone({message,options:sendOptions}));
        assert.equal(db.daily_communications.filter(r=>r.status==='queued').length>=1,true,'claim precedes provider');
        if(options.provider==='throw')throw new Error('transport');
        if(options.provider==='definitive')return {data:null,error:{name:'validation_error'}};
        if(options.provider==='ambiguous')return {data:null,error:{name:'application_error'}};
        return {data:options.provider==='no_id'?{}:{id:Object.hasOwn(options,'providerId')?options.providerId:'provider-1'},error:null};
      }};}};
      if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
      throw new Error(`Forbidden import ${name}`);
    }},{filename:path});cache[path]=module.exports;return module.exports;
  }
  return {options,db,session,learner,enrolment,document,convocation,calls,sends,downloads,load,
    advance:()=>{now+=49*60*60*1000;},
    manual:()=>load('app/api/client/daily/pretraining-documents/send/route.ts').POST({json:async()=>({document_id:document.id})}),
    pack:()=>load('lib/server/dailySignedConventionPretrainingPack.ts').dispatchPretrainingPackAfterConventionSigned(admin,'convention')};
}
const status=(result)=>result.body?.status??result.status;
for(const circuit of ['manual','pack']) {
  test(`${circuit}: success requires durable exact evidence and preserves attachment`,async()=>{
    const h=harness();assert.equal(status(await h[circuit]()),'sent');
    const row=h.db.daily_communications[0];assert.equal(row.provider_message_id,'provider-1');assert.equal(row.sent_at,'2026-10-02T10:00:00.000Z');
    assert.equal(row.metadata.storage_path,circuit==='manual'?'original.doc':'legacy-original.doc');
    assert.equal(row.metadata.document_version,1);assert.equal(h.sends[0].message.to,h.learner.email);
    assert.equal(h.sends[0].message.attachments[0].content,Buffer.from('ORIGINAL BYTES').toString('base64'));
    assert.equal(h.sends[0].message.attachments[0].filename,circuit==='manual'?'convocation-alice-nom-v1.doc':'convocation-original.doc');
    assert.equal(row.subject,h.sends[0].message.subject);assert.equal(row.text_body,h.sends[0].message.text);assert.equal(row.html_body,h.sends[0].message.html);
    assert.equal(h.db.daily_communication_documents.length,circuit==='manual'?1:0);
    assert.equal(status(await h[circuit]()),'already_sent');assert.equal(h.sends.length,1);
  });
  for(const fault of [{provider:'no_id'},{providerId:42},{providerId:{}},{providerId:''},{providerId:'   '},{provider:'ambiguous'},{provider:'throw'},{finalize:'error'},{finalize:'throw'},{finalize:'zero'}]) test(`${circuit}: uncertainty persists beyond 24h ${JSON.stringify(fault)}`,async()=>{
    const h=harness({...fault});const first=await h[circuit]();assert.equal(status(first),'pending');
    if(circuit==='manual'){assert.equal(first.status,202);assert.equal(first.body.evidenceRecorded,false);assert.equal(first.body.sentAt,undefined);assert.equal(first.body.sentTo,undefined);}
    assert.equal(h.db.daily_communications[0].status,'queued');
    h.advance();Object.keys(fault).forEach(k=>delete h.options[k]);
    assert.equal(status(await h[circuit]()),'pending');assert.equal(h.sends.length,1);
  });
  for(const fault of ['error','throw','zero']) test(`${circuit}: failed reservation ${fault} prevents provider`,async()=>{
    const h=harness({claim:fault});assert.equal(status(await h[circuit]()),'pending');assert.equal(h.sends.length,0);
  });
  test(`${circuit}: concurrent calls have one durable owner`,async()=>{
    const h=harness();const results=await Promise.all(Array.from({length:8},()=>h[circuit]()));assert.equal(h.sends.length,1);assert.equal(h.db.daily_communications.length,1);assert.equal(results.filter(r=>status(r)==='sent').length,1);
  });
  test(`${circuit}: definitive rejection retries once with frozen content and stable key`,async()=>{
    const h=harness({provider:'definitive'});assert.equal(status(await h[circuit]()),circuit==='manual'?'rejected':'send_failed');
    h.session.daily_formations.title='Changed';h.options.bytes='NEW BYTES';h.options.provider='success';
    await Promise.all(Array.from({length:5},()=>h[circuit]()));assert.equal(h.sends.length,2);assert.deepEqual(h.sends[0],h.sends[1]);assert.equal(h.downloads.length,1);
  });
  test(`${circuit}: retries bounded after two definitive rejections`,async()=>{
    const h=harness({provider:'definitive'});await h[circuit]();await h[circuit]();assert.equal(status(await h[circuit]()),'pending');assert.equal(h.sends.length,2);
  });
  test(`${circuit}: file failure is safe to retry without provider call`,async()=>{
    const h=harness({download:true});await h[circuit]();assert.equal(h.sends.length,0);assert.equal(h.db.daily_communications.length,0);delete h.options.download;assert.equal(status(await h[circuit]()),'sent');
  });
  test(`${circuit}: read failure after persisted proof does not report sent`,async()=>{
    const h=harness({readProof:true});assert.equal(status(await h[circuit]()),'pending');delete h.options.readProof;assert.equal(status(await h[circuit]()),'already_sent');assert.equal(h.sends.length,1);
  });
  for(const legacyStatus of ['queued','sent']) for(const field of ['provider_message_id','sent_at']) test(`${circuit}: historical ${legacyStatus} missing ${field}`,async()=>{
    const h=harness();await h[circuit]();const row=h.db.daily_communications[0];row.id='legacy';row.status=legacyStatus;row[field]=null;h.sends.length=0;
    assert.equal(status(await h[circuit]()),'pending');assert.equal(h.sends.length,0);assert.equal(row[field],null);
  });
  for(const dimension of ['version','email','session','org','document']) test(`${circuit}: isolates ${dimension}`,async()=>{
    const h=harness();await h[circuit]();
    if(dimension==='version'){h.document.version++;h.convocation.version++;h.convocation.status='generated';h.convocation.sent_at=null;}
    if(dimension==='email'){h.learner.email='other@example.test';h.convocation.recipient_email=h.learner.email;h.convocation.status='generated';h.convocation.sent_at=null;}
    if(dimension==='session'){h.session.id='session2';h.enrolment.session_id='session2';h.convocation.session_id='session2';h.db.daily_conventions[0].session_id='session2';h.convocation.status='generated';h.convocation.sent_at=null;}
    if(dimension==='org'){h.options.org='org2';h.session.organisation_id='org2';h.document.organisation_id='org2';h.enrolment.organisation_id='org2';h.convocation.status='generated';h.convocation.sent_at=null;}
    if(dimension==='document'){h.document.id='doc2';h.convocation.id='conv2';h.convocation.status='generated';h.convocation.sent_at=null;}
    assert.equal(status(await h[circuit]()),'sent');assert.equal(new Set(h.sends.map(s=>s.options.idempotencyKey)).size,2);
  });
}
for(const fault of ['error','throw','zero']) test(`manual: snapshot ${fault} prevents send and supports bounded CAS retry`,async()=>{
  const h=harness({snapshot:fault});assert.equal(status(await h.manual()),'rejected');assert.equal(h.sends.length,0);assert.equal(h.db.daily_communications[0].status,'failed');
  delete h.options.snapshot;h.options.bytes='CHANGED';await Promise.all([h.manual(),h.manual()]);assert.equal(h.sends.length,1);assert.equal(h.sends[0].message.attachments[0].content,Buffer.from('ORIGINAL BYTES').toString('base64'));
});
for(const fault of ['error','throw','zero']) test(`pack: projection ${fault} stays pending, then repairs from durable proof`,async()=>{
  const h=harness({projection:fault});assert.equal(status(await h.pack()),'pending');assert.equal(h.convocation.status,'generated');assert.equal(h.db.daily_communications[0].status,'sent');
  delete h.options.projection;assert.equal(status(await h.pack()),'already_sent');assert.equal(h.convocation.status,'sent');assert.equal(h.sends.length,1);
});
for(const historical of ['sent','viewed','sent_at']) test(`pack: historical ${historical} without communication is never resent`,async()=>{
  const h=harness();if(historical==='sent_at')h.convocation.sent_at='2026-01-01T10:00:00Z';else h.convocation.status=historical;
  assert.equal(status(await h.pack()),'pending');assert.equal(h.sends.length,0);assert.equal(h.downloads.length,0);
});
for(const guard of ['unauthorized','assisted','wrong_org','replaced','unvalidated','declined','cancelled','abandoned','archived']) test(`manual: ${guard} precedes storage, claim and provider`,async()=>{
  const h=harness({[guard]:true});
  if(guard==='wrong_org')h.options.org='other';if(guard==='replaced')h.document.is_current=false;if(guard==='unvalidated')h.document.status='draft';
  if(['declined','cancelled','abandoned'].includes(guard))h.enrolment.status=guard;if(guard==='archived')h.session.status='archived';
  const result=await h.manual();assert.ok(result.status>=400);assert.equal(h.downloads.length,0);assert.equal(h.sends.length,0);assert.ok(h.calls.every(c=>c.action==='read'));
});
for(const guard of ['missing_signatures','incomplete_signatures','declined','cancelled','abandoned','archived']) test(`pack: ${guard} precedes storage, claim and provider`,async()=>{
  const h=harness();if(guard==='missing_signatures')h.db.daily_convention_signatures=[];if(guard==='incomplete_signatures')h.db.daily_convention_signatures.push({id:'sig2',convention_id:'convention',status:'pending'});
  if(['declined','cancelled','abandoned'].includes(guard))h.enrolment.status=guard;if(guard==='archived')h.session.status='archived';
  await h.pack();assert.equal(h.downloads.length,0);assert.equal(h.sends.length,0);assert.ok(h.calls.every(c=>c.action==='read'));
});
test('sources isolate the canonical document from legacy convocation',async()=>{const h=harness();await h.manual();await h.pack();assert.equal(new Set(h.sends.map(s=>s.options.idempotencyKey)).size,2);});
for(const circuit of ['manual','pack']) {
  test(`${circuit}: complete historical communication is reused with no new claim`,async()=>{
    const h=harness();await h[circuit]();const row=h.db.daily_communications[0];const oldId=row.id;row.id='historical-id';
    h.db.daily_communication_documents.forEach(link=>{if(link.communication_id===oldId)link.communication_id=row.id;});
    assert.equal(status(await h[circuit]()),'already_sent');assert.equal(h.sends.length,1);assert.equal(h.db.daily_communications.length,1);
  });
  test(`${circuit}: missing API key is a bounded failure before provider`,async()=>{
    const h=harness({noKey:true});await h[circuit]();await h[circuit]();assert.equal(status(await h[circuit]()),'pending');assert.equal(h.sends.length,0);assert.equal(h.db.daily_communications[0].metadata.attempt,2);
  });
  test(`${circuit}: frozen-clock concurrent definitive failures never exceed two calls`,async()=>{
    const h=harness({provider:'definitive'});await h[circuit]();await Promise.all(Array.from({length:20},()=>h[circuit]()));assert.equal(h.sends.length,2);assert.equal(h.db.daily_communications[0].metadata.attempt,2);
  });
  test(`${circuit}: malformed historical timestamp cannot prove delivery`,async()=>{
    const h=harness();await h[circuit]();h.db.daily_communications[0].sent_at='yesterday';assert.equal(status(await h[circuit]()),'pending');assert.equal(h.sends.length,1);
  });
}
test('manual: historical proof without exact canonical link stays uncertain',async()=>{
  const h=harness();await h.manual();h.db.daily_communication_documents[0].storage_path='different.doc';assert.equal(status(await h.manual()),'pending');assert.equal(h.sends.length,1);
});
test('pack: historical proof without exact legacy file stays uncertain',async()=>{
  const h=harness();await h.pack();delete h.db.daily_communications[0].metadata.storage_path;assert.equal(status(await h.pack()),'pending');assert.equal(h.sends.length,1);
});

for(const circuit of ['manual','pack']) test(`${circuit}: equivalent PostgreSQL timestamp timezone is accepted`,async()=>{
  const h=harness({postgresTime:true});assert.equal(status(await h[circuit]()),'sent');assert.equal(status(await h[circuit]()),'already_sent');assert.equal(h.sends.length,1);
});
