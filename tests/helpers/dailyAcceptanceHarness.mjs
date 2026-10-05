import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
export function harness(options = {}) {
  const formation = { id: 'formation', organisation_id: 'org', title: 'Formation <test>', status: 'validated', creation_mode: 'selen_form', duration_hours: 14, public_registration_enabled: true, public_registration_token: 'public-token' };
  const session = { id: 'session', formation_id: 'formation', organisation_id: 'org', user_id: 'owner', start_date: '2026-10-05', end_date: '2026-10-06', modality: 'presentiel', location_address: '1 rue Exemple', schedule_blocks: [{ date: '2026-10-05', start: '09:00', end: '17:00', note: 'Accueil' }], daily_formations: formation };
  const learner = { id: 'learner', organisation_id: 'org', first_name: 'Alice', last_name: '<Nom>', email: 'alice@example.test' };
  const request = { id: 'request', formation_id: 'formation', decision_status: 'accepted', response_type: 'beneficiary', respondent_first_name: 'Alice', respondent_last_name: '<Nom>', respondent_email: learner.email, participants: [], attached_session_id: options.materialized ? 'session' : null };
  const enrolment = { id: 'enrolment', organisation_id: 'org', session_id: 'session', learner_id: 'learner', status: 'pending', contracting_party_type: null, daily_learners: learner, daily_sessions: session };
  const db = {
    daily_formations: [formation], daily_sessions: [session], organisations: [{ id: 'org', name: 'OF <test>', email: 'of@example.test', phone: '0102030405', address: '2 rue OF', contact_name: 'Contact OF' }],
    daily_formation_registration_requests: [request], daily_session_enrolments: [enrolment], daily_registration_request_enrolments: options.materialized ? [{ registration_request_id: 'request', enrolment_id: 'enrolment' }] : [],
    daily_portal_access_tokens: [{ id: 'access', session_id: 'session', portal_type: 'learner', entity_key: 'learner:learner', token: 'personal', status: 'pending' }], daily_communications: [], daily_trainer_profiles: [],
  };
  const calls = [], sends = [], auth = [];
  let provider = options.provider || 'success';
  const admin = { from(table) {
    assert.ok(Object.hasOwn(db, table), `Unexpected table: ${table}`);
    let mutation = null, payload, filters = [], one = false, limit;
    const query = {
      select(columns) { assert.equal(typeof columns, 'string'); calls.push(['select', table, columns]); return query; },
      eq(k,v) { filters.push(r => r[k] === v); return query; },
      neq(k,v) { filters.push(r => r[k] !== v); return query; },
      in(k,v) { filters.push(r => v.includes(r[k])); return query; },
      not(k,op,v) { assert.equal(op,'in'); filters.push(r => !v.slice(1,-1).split(',').includes(r[k])); return query; },
      contains(k,v) { filters.push(r => Object.entries(v).every(([key,value]) => r[k]?.[key] === value)); return query; },
      order() { return query; }, limit(n) { limit=n; return query; },
      insert(value) { assert.ok(['daily_communications','daily_portal_access_tokens'].includes(table), `Forbidden insert ${table}`); mutation='insert'; payload=value; return query; },
      update(value) { assert.ok(['daily_communications','daily_portal_access_tokens'].includes(table) || (options.enterprise && table === 'daily_sessions' && Object.keys(value).every(k => ['companies','updated_at'].includes(k))), `Forbidden update ${table}`); mutation='update'; payload=value; return query; },
      single() { one=true; return query; }, maybeSingle() { one=true; return query; },
      then(resolve,reject) { return Promise.resolve().then(() => {
        calls.push([mutation || 'read', table, payload]);
        if (mutation === 'insert') {
          if (db[table].some(r => r.id === payload.id)) return { data:null, error:{code:'23505'} };
          if (options.claimFailure && table === 'daily_communications') return {data:null,error:{code:'write_failed'}};
          const row = { id: `new-${db[table].length}`, ...structuredClone(payload) }; db[table].push(row); return {data:row,error:null};
        }
        let rows = db[table].filter(r => filters.every(f => f(r)));
        if (mutation === 'update') {
          if (options.proofThrow && payload.status === 'sent') throw new Error('proof transport failure');
          if ((options.proofFailure || options.proofZeroRows) && payload.status === 'sent') return {data:null,error:options.proofFailure ? {code:'write_failed'} : null};
          rows.forEach(r => Object.assign(r, structuredClone(payload)));
        }
        if(limit) rows=rows.slice(0,limit);
        return {data:one ? rows[0] || null : rows,error:null};
      }).then(resolve,reject); },
    }; return query;
  }, async rpc(name,args) {
    calls.push(['rpc',name,args]);
    if(name === 'daily_accept_and_materialize_registration_request') {
      if(!args.p_session_id) return {data:null,error:{message:'session required'}};
      if(request.decision_status === 'refused') return {data:null,error:{message:'already decided'}};
      const replayed=request.decision_status === 'accepted';
      if(!replayed) request.decision_status='accepted';
      if(options.materializeFailure) { if(!replayed) request.decision_status='ready_for_of'; return {data:null,error:{message:'materialization failed'}}; }
      request.attached_session_id=args.p_session_id; request.materialized_at='2026-10-01';
      db.daily_registration_request_enrolments=[{registration_request_id:'request',enrolment_id:'enrolment'}];
      return {data:{replayed,materialization:{created:true}},error:null};
    }
    if(name === 'daily_record_registration_request_decision') {
      if(request.decision_status !== 'ready_for_of') return {data:null,error:{message:'already decided'}};
      request.decision_status=args.p_decision; return {data:{accepted:true},error:null};
    }
    assert.equal(name,'daily_materialize_registration_request');
    if(options.materializeFailure) return {data:null,error:{message:'materialization failed'}};
    assert.equal(request.decision_status,'accepted'); request.attached_session_id=args.p_session_id; request.materialized_at='2026-10-01';
    db.daily_registration_request_enrolments=[{registration_request_id:'request',enrolment_id:'enrolment'}]; return {data:{created:true},error:null};
  } };
  const cache = {};
  function load(path) {
    if(cache[path]) return cache[path];
    const module={exports:{}};
    const source=fs.readFileSync(path,'utf8');
    vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
      module,exports:module.exports,URL,Date,console:{error(){}},process:{env:{RESEND_API_KEY:options.missingProvider ? '' : 'mock-only'}},
      fetch() { throw new Error('Network forbidden'); },
      require(name) {
        if(name === 'node:crypto') return crypto;
        if(name === 'resend') return {Resend:class {emails={send:async (message,options) => {
          assert.ok(options.idempotencyKey); assert.equal(message.attachments,undefined); sends.push({message,options});
          if(provider === 'throw') throw new Error('mock transport error');
          if(provider === 'error') return {data:null,error:{name:'validation_error'}};
          if(provider === 'ambiguous') return {data:null,error:{name:'application_error'}};
          return {data:provider === 'no_id' ? {} : {id:`resend-${sends.length}`},error:null};
        }}}};
        if(name === '@/lib/server/dailyPortalAuthEntry') return {buildDailyPortalAuthEntryUrl:async input => {auth.push(input); if(options.authFailure) throw new Error('mock Auth failure'); return `https://site.test/client/activation?token_hash=mock&next=${input.token}`;}};
        if(['@/lib/server/dailyAcceptanceEmail','@/lib/server/dailyLearnerEmailDelivery','@/lib/server/dailyLearnerPortalAccess'].includes(name)) return load(name.replace('@/','')+'.ts');
        if(name === '@/lib/server/clientNdaAccess') return {getAdminSupabase:() => admin};
        if(name === '@/lib/server/dailyClientWorkspace') return {getDailyClientWorkspace:async () => ({ok:true,user:{id:'owner'},workspace:{membership:{organisation_id:'org',roles:options.nonManager ? [] : ['manager']}}})};
        if(name === '@/lib/server/dailyEnterprisePortalAccess' && options.enterprise) return load('lib/server/dailyEnterprisePortalAccess.ts');
        if(name === '@/lib/server/dailyEnterprisePortalAccess') return {sendEnterprisePortalAccessForRegistrationRequest:async () => []};
        if(name === 'next/server') return {NextResponse:{json:(data,init) => ({status:init?.status || 200, json:async () => data})}};
        throw new Error(`Unexpected import / network SDK: ${name}`);
      },
    },{filename:path}); cache[path]=module.exports; return module.exports;
  }
  const helper=load('lib/server/dailyLearnerPortalAccess.ts');
  const input={registrationRequestId:'request',organisationId:'org',origin:'https://site.test',createdBy:'owner'};
  return {admin,db,formation,session,learner,request,enrolment,calls,sends,auth,load,helper,input,setProvider:p => {provider=p;},send:() => helper.sendLearnerPortalAccessForRegistrationRequest(admin,input),ensure:(extra={}) => helper.ensureAndSendLearnerPortalAccess(admin,{...input,enrolmentId:'enrolment',...extra}),post:async body => {
    const response=await load('app/api/client/daily/registration-requests/route.ts').POST({url:'https://site.test/api/client/daily/registration-requests',json:async () => ({request_id:'request',...body})}); return {status:response.status,...await response.json()};
  }};
}
