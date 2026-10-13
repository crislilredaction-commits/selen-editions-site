import assert from 'node:assert/strict';
import test from 'node:test';
import { delegatedHarness, ids, tokenHash } from './helpers/delegatedRegistrationHarness.mjs';

test('Décisions Studio : vraie API et migration exécutée dans PostgreSQL isolé', async t => {
  const h=await delegatedHarness(); t.after(()=>h.db.close());
  const rows=async table=>(await h.q(`select * from public.${table}`)).rows;
  const unchanged=async()=>{
    assert.equal((await rows('daily_registration_request_decisions')).length,0);
    assert.equal((await rows('selen_agent_assistance_logs')).length,0);
    assert.equal((await rows('daily_registration_request_enrolments')).length,0);
    assert.equal((await rows('daily_session_enrolments')).length,0);
    assert.equal((await rows('daily_learners')).length,0);
    assert.equal((await rows('daily_registration_request_reconciliations')).length,0);
    assert.equal((await h.q('select decision_status from daily_formation_registration_requests where id=$1',[ids.request])).rows[0].decision_status,'ready_for_of');
    assert.equal(h.sends.length,0);
  };
  await t.test('acceptation atomique, auteur réel et accès seulement après audit',async()=>{
    await h.reset();
    const response=await h.api.POST(h.request({decision:'accepted',session_id:ids.session,actor_user_id:ids.owner,actor_type:'organisation'}));
    assert.equal(response.status,200); const result=await response.json(); assert.equal(result.materialized,true);
    const [decision]=await rows('daily_registration_request_decisions');
    assert.equal(decision.actor_type,'studio_agent'); assert.equal(decision.actor_user_id,ids.agent); assert.notEqual(decision.actor_user_id,ids.owner);
    assert.equal(decision.delegation_context.assistance_id,ids.assistance); assert.equal(decision.delegation_context.organisation_id,ids.org);
    const [audit]=await rows('selen_agent_assistance_logs');
    assert.equal(audit.id,result.result.audit_id); assert.equal(audit.agent_user_id,ids.agent); assert.equal(audit.old_state.decision_status,'ready_for_of'); assert.equal(audit.new_state.decision_status,'accepted');
    assert.equal((await rows('daily_session_enrolments')).length,1); assert.equal((await rows('daily_registration_request_enrolments')).length,1);
    assert.equal(h.rpcCalls[0].p_token_hash,tokenHash); assert.equal('p_actor_user_id' in h.rpcCalls[0],false);
    assert.equal(h.sends.length,2); assert.ok(h.sends.every(send=>send.createdBy===ids.agent));
  });
  await t.test('refus : décision et audit, aucune inscription ni invitation',async()=>{
    await h.reset(); const response=await h.api.POST(h.request({decision:'refused',comment:'Dossier refusé'}));
    assert.equal(response.status,200); assert.equal((await rows('daily_registration_request_decisions'))[0].decision,'refused');
    assert.equal((await rows('selen_agent_assistance_logs'))[0].agent_user_id,ids.agent); assert.equal(h.sends.length,0);
    assert.equal((await rows('daily_session_enrolments')).length,0);
    assert.equal((await h.api.POST(h.request({decision:'accepted',session_id:ids.session}))).status,409);
  });
  const invalidDelegations=[
    ['expirée',"update selen_agent_assistance_tokens set expires_at=now()-interval '1 minute'",{}],
    ['révoquée',"update selen_agent_assistance_tokens set status='revoked'",{}],
    ['mauvais périmètre',"update selen_agent_assistance_tokens set metadata='{\"scope\":\"another_workspace\"}'",{}],
    ['acteur absent','update selen_agent_assistance_tokens set agent_user_id=null',{}],
    ['acteur désactivé','update agent_profiles set is_active=false',{}],
    ['identité liée à un autre compte',`update agent_profiles set user_id='${ids.owner}'`,{}],
    ['hash erroné','select 1',{p_token_hash:'invalid'}],
    ['organisme étranger','select 1',{p_request_id:ids.foreignRequest}],
    ['session étrangère','select 1',{p_session_id:ids.foreignSession}],
  ];
  for(const [label,sql,args]of invalidDelegations)await t.test(`SQL refuse une délégation ${label}`,async()=>{
    await h.reset(); await h.db.exec(sql); const result=await h.call(args); assert.equal(result.error?.code,'42501',result.error?.message); await unchanged();
  });
  await t.test('API : token invalide interdit même si un cookie OF valide est présent',async()=>{
    await h.reset();
    assert.equal((await h.api.GET(h.request(null,'invalid'))).status,403);
    assert.equal((await h.api.POST(h.request({decision:'refused'},'invalid'))).status,403);
    h.flags.forceFallback=true; assert.equal((await h.api.POST(h.request({decision:'refused'}))).status,403);
    assert.equal(h.rpcCalls.length,0); await unchanged();
  });
  await t.test('API et SQL imposent une confirmation explicite',async()=>{
    await h.reset(); assert.equal((await h.api.POST(h.request({decision:'refused',confirm_delegated:false}))).status,400);
    assert.equal((await h.call({p_confirmed:false})).error?.code,'22023'); await unchanged();
  });
  for(const [label,sql,expected]of [
    ['prérequis non validés','update daily_formation_registration_requests set prerequisites_validated=false','prerequisites'],
    ['analyse inachevée','update daily_formation_registration_requests set agent_analysis_completed_at=null','analysis'],
    ['candidature pending',"update daily_formation_registration_requests set decision_status='pending'",'analysis'],
    ['session indisponible',"update daily_sessions set status='archived'",'unavailable'],
    ['formation incompatible',`update daily_sessions set formation_id='${ids.oldFormation}' where id='${ids.session}'`,'match'],
  ])await t.test(`SQL bloque ${label}`,async()=>{
    await h.reset(); await h.db.exec(sql); assert.match((await h.call({})).error.message,new RegExp(expected));
    assert.equal((await rows('daily_registration_request_decisions')).length,0); assert.equal((await rows('selen_agent_assistance_logs')).length,0);
    assert.equal((await rows('daily_session_enrolments')).length,0);
  });
  await t.test('échec de matérialisation : annulation de la décision et aucune invitation',async()=>{
    await h.reset(); await h.db.exec("update daily_formation_registration_requests set respondent_email=null");
    assert.equal((await h.api.POST(h.request({decision:'accepted',session_id:ids.session}))).status,409); await unchanged();
  });
  await t.test('échec de l’audit : rollback inscription, décision et régularisation',async()=>{
    await h.reset(); await h.db.exec("alter table selen_agent_assistance_logs add constraint reject_test_audit check(action='impossible')");
    try{
      assert.equal((await h.api.POST(h.request({decision:'accepted',session_id:ids.session}))).status,409); await unchanged();
      assert.equal((await h.call({p_action:'accept_historical',p_session_id:ids.oldSession,p_historical_reason:'Session historique confirmée'})).error?.code,'23514'); await unchanged();
      assert.equal((await h.q('select formation_id from daily_formation_registration_requests where id=$1',[ids.request])).rows[0].formation_id,ids.formation);
    }finally{await h.db.exec('alter table selen_agent_assistance_logs drop constraint reject_test_audit');}
  });
  await t.test('rejeu acceptation : identifiants stables, aucune double décision ni inscription',async()=>{
    await h.reset(); const first=await h.call({}), second=await h.call({});
    assert.equal(first.error,null); assert.equal(second.error,null); assert.equal(second.data.replayed,true);
    assert.equal(first.data.decision_id,second.data.decision_id); assert.deepEqual(first.data.materialization.enrolment_ids,second.data.materialization.enrolment_ids);
    assert.equal((await rows('daily_registration_request_decisions')).length,1); assert.equal((await rows('daily_learners')).length,1); assert.equal((await rows('daily_session_enrolments')).length,1);
    assert.equal((await h.call({p_session_id:ids.oldSession})).error?.message,'accepted session cannot be changed');
  });
  await t.test('matérialisation et reprise d’accès déléguées préservent la décision OF d’origine',async()=>{
    await h.reset();const original=await h.insert('daily_registration_request_decisions',{registration_request_id:ids.request,organisation_id:ids.org,actor_type:'organisation',actor_user_id:ids.owner,decision:'accepted'});
    await h.q("update daily_formation_registration_requests set decision_status='accepted',accepted_decision_id=$1 where id=$2",[original.id,ids.request]);
    const materialize=await h.api.POST(h.request({action:'materialize',session_id:ids.session}));assert.equal(materialize.status,200);
    const retry=await h.api.POST(h.request({action:'send_learner_access'}));assert.equal(retry.status,200);
    assert.equal((await rows('daily_registration_request_decisions')).length,1);
    assert.equal((await rows('daily_registration_request_decisions'))[0].actor_user_id,ids.owner);
    assert.equal((await rows('daily_session_enrolments')).length,1);
    assert.deepEqual((await rows('selen_agent_assistance_logs')).map(log=>log.agent_user_id),[ids.agent,ids.agent]);
    assert.equal((await h.q('select accepted_decision_id from daily_formation_registration_requests where id=$1',[ids.request])).rows[0].accepted_decision_id,original.id);
  });
  await t.test('session historique : version archivée conservée, inscription confirmée réutilisée',async()=>{
    await h.reset(); await h.insert('daily_learners',{id:ids.learner,organisation_id:ids.org,first_name:'Alice',last_name:'Exemple',email:'alice@example.test'});
    await h.insert('daily_session_enrolments',{id:ids.enrolment,organisation_id:ids.org,session_id:ids.oldSession,learner_id:ids.learner,status:'confirmed'});
    const response=await h.api.POST(h.request({action:'accept_historical',session_id:ids.oldSession,reason:'Formation suivie sur cette ancienne session',confirm_historical:true}));
    assert.equal(response.status,200);const result=await response.json();assert.equal(result.reconciled,true);
    assert.deepEqual(result.result.materialization.enrolment_ids,[ids.enrolment]);
    assert.equal((await rows('daily_registration_request_reconciliations'))[0].actor_user_id,ids.agent);
    assert.equal((await rows('daily_session_enrolments'))[0].status,'confirmed');
    assert.equal((await h.q('select status from daily_formations where id=$1',[ids.oldFormation])).rows[0].status,'archived');
    const get=await h.api.GET(h.request());assert.equal(get.status,200);const body=await get.json();
    assert.equal(body.requests.length,1);assert.equal(body.requests[0].formation_id,ids.oldFormation);assert.equal(body.requests[0].decisions[0].actor_label,'Agent Réel');
    assert.equal(body.requests[0].materialized_count,1); assert.equal('delegation_context' in body.requests[0].decisions[0],false);
    assert.equal((await h.call({p_action:'accept_historical',p_session_id:ids.oldSession,p_historical_reason:'Formation ancienne confirmée'})).error,null);
    assert.equal((await rows('daily_registration_request_reconciliations')).length,1); assert.equal((await rows('daily_session_enrolments')).length,1);
  });
  for(const [label,sql]of [
    ['programme différent',`update daily_formations set global_objective='Autre objectif' where id='${ids.oldFormation}'`],
    ['absence de filiation',`update daily_formations set previous_version_id=null where id='${ids.formation}'`],
    ['justificatif existant',`insert into daily_prerequisite_evidence(registration_request_id) values('${ids.request}')`],
    ['contrat de prérequis incompatible',`update daily_formation_registration_requests set prerequisite_contract='{ "mode":"evidence", "requirements":[]}'`],
  ])await t.test(`régularisation refusée : ${label}`,async()=>{
    await h.reset(); await h.db.exec(sql); assert.ok((await h.call({p_action:'accept_historical',p_session_id:ids.oldSession,p_historical_reason:'Session historique confirmée'})).error);await unchanged();
  });
  await t.test('GET délégué : périmètre OF, historique et sessions compatibles seulement',async()=>{
    await h.reset(); const response=await h.api.GET(h.request()); assert.equal(response.status,200);const body=await response.json();
    assert.deepEqual(body.actor_types,['studio_agent']); assert.equal(body.read_only,false);
    assert.equal(body.requests.length,1);assert.equal(body.requests[0].can_decide,true);assert.equal(body.requests[0].delegated,true);
    assert.equal(body.sessions.some(session=>session.id===ids.foreignSession),false);
    assert.deepEqual(body.historical_sessions[0].source_formation_ids,[ids.formation]);
  });
  await t.test('suppression du token : décision et contexte d’audit persistent',async()=>{
    await h.reset();assert.equal((await h.call({})).error,null);
    await h.q('delete from selen_agent_assistance_tokens where id=$1',[ids.assistance]);
    const [audit]=await rows('selen_agent_assistance_logs');assert.equal(audit.assistance_token_id,null);assert.equal(audit.metadata.assistance_id,ids.assistance);assert.equal(audit.agent_user_id,ids.agent);
    assert.equal((await rows('daily_registration_request_decisions'))[0].delegation_context.assistance_id,ids.assistance);
    const response=await h.api.GET(h.request(null,null));assert.equal(response.status,200);assert.equal((await response.json()).requests[0].decisions[0].actor_label,'Agent Réel');
  });
  await t.test('seul service_role peut exécuter la RPC ; contexte auteur obligatoire',async()=>{
    await h.reset();
    for(const role of ['anon','authenticated']){
      await h.db.exec(`set role ${role}`);
      try{await assert.rejects(h.q('select public.daily_decide_delegated_registration_request($1,$2,$3,$4)',[ids.request,ids.assistance,tokenHash,'refused']),error=>error.code==='42501');}
      finally{await h.db.exec('reset role');}
    }
    await assert.rejects(h.insert('daily_registration_request_decisions',{registration_request_id:ids.request,organisation_id:ids.org,actor_type:'studio_agent',actor_user_id:ids.agent,decision:'refused',delegation_context:{assistance_id:ids.assistance}}),error=>error.code==='23514');
    await unchanged();
  });
});
