import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {loadTypeScript} from './helpers/loadTypeScript.mjs';

const openedAt='2026-10-13T21:15:57.287532+00:00';
const org='of-a',session='historical-session',id='enrolment-a',agent='real-studio-agent';
const party=loadTypeScript('lib/dailyContractingParty.ts');
const guard=loadTypeScript('lib/server/dailyDelegatedRegistrationDecision.ts',{'node:crypto':{createHash}});
const next={'next/server':{NextResponse:{json:Response.json}}};
const operation=loadTypeScript('lib/server/dailyEnrolmentContractingParty.ts',{...next,'@/lib/dailyContractingParty':party,'@/lib/server/dailyDelegatedRegistrationDecision':guard},{Date});

function fixture(){
 const row={id,organisation_id:org,session_id:session,learner_id:'learner-a',status:'pending',contracting_party_type:null,company_name:null,funding_type:'self_funded',created_by:'original-author',updated_at:openedAt};
 const rows={daily_session_enrolments:[row,{...row,id:'other-enrolment'}],daily_sessions:[{id:session,organisation_id:org,status:'ready',companies:[{name:'Entreprise QA'}],formation_archived:true}],daily_documents:[],selen_agent_assistance_logs:[]};
 const flags={sqlDeny:false,beforeUpdate:null,auditInsertError:false,auditFinalError:false,writeError:false};const writes=[],rpcCalls=[];
 const admin={async rpc(name,args){assert.equal(name,'daily_assert_document_delegation');rpcCalls.push(args);return{data:flags.sqlDeny?null:agent,error:flags.sqlDeny?{message:'denied'}:null};},from(table){assert.ok(Object.hasOwn(rows,table),table);const filters=[];let payload,kind='read',single=false;
  const q={select(){return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},in(k,v){filters.push(row=>v.includes(row[k]));return q;},not(k,op,v){assert.equal(op,'eq');filters.push(row=>row[k]!==v);return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},insert(value){payload=value;kind='insert';return q;},update(value){payload=value;kind='update';return q;},then(resolve,reject){return(async()=>{
   if(kind==='update'&&table==='daily_session_enrolments'&&flags.beforeUpdate){flags.beforeUpdate();flags.beforeUpdate=null;}
   const fail=kind==='insert'&&flags.auditInsertError||kind==='update'&&table==='daily_session_enrolments'&&flags.writeError||kind==='update'&&table==='selen_agent_assistance_logs'&&flags.auditFinalError;
   if(fail)return{data:null,error:{message:'Isolated failure'}};
   let matches=rows[table].filter(row=>filters.every(f=>f(row)));
   if(kind==='insert'){const inserted={id:`audit-${rows[table].length}`,...structuredClone(payload)};rows[table].push(inserted);matches=[inserted];writes.push({table,kind,payload:structuredClone(payload)});}
   if(kind==='update')for(const match of matches){Object.assign(match,structuredClone(payload));if(table==='daily_session_enrolments')match.updated_at='2026-10-14T08:35:00.123456+00:00';writes.push({table,kind,payload:structuredClone(payload)});}
   const result=structuredClone(matches);return{data:single?result[0]??null:result,error:null};
  })().then(resolve,reject);}};return q;
 }};
 const context={ok:true,admin,organisationId:org,user:{id:'of-manager'},assisted:true,assistance:{id:'delegation-a',organisation_id:org,agent_user_id:agent,agent_email:'agent@example.test',status:'active',expires_at:'2100-01-01T00:00:00Z',metadata:{scope:'daily_workspace'}}};
 const route=loadTypeScript('app/api/client/daily/learners/route.ts',{...next,'@/lib/dailyContractingParty':party,'@/lib/dailyLearnerPortalDirectory':loadTypeScript('lib/dailyLearnerPortalDirectory.ts'),'@/lib/server/dailyOrganisationContext':{getDailyOrganisationContext:async()=>context},'@/lib/server/dailyLearnerPortalAccess':{ensureAndSendLearnerPortalAccess:()=>{throw Error('Unexpected email/access');}},'@/lib/server/agentAssistance':{logAgentAssistanceAction:()=>{throw Error('Unexpected generic write');}},'@/lib/server/dailyEnrolmentContractingParty':operation});
 const patch=extra=>route.PATCH(new Request('https://www.selen-editions.fr/api/client/daily/learners',{method:'PATCH',headers:{'x-selen-agent-assistance':'isolated-token'},body:JSON.stringify({action:'contracting_party',id,session_id:session,expected_updated_at:openedAt,contracting_party_type:'individual',confirm_delegated:true,...extra})}));
 return{rows,row,flags,writes,context,patch,rpcCalls};
}

test('le choix explicite en délégation modifie seulement la bonne inscription et conserve l’agent réel dans le journal',async()=>{
 const f=fixture();const response=await f.patch({status:'cancelled',funding_type:'employer',learner_id:'foreign'});assert.equal(response.status,200);
 assert.equal(f.row.contracting_party_type,'individual');assert.equal(f.row.status,'pending');assert.equal(f.row.funding_type,'self_funded');assert.equal(f.row.created_by,'original-author');assert.equal(f.row.learner_id,'learner-a');assert.notEqual(f.row.updated_at,openedAt);
 assert.equal(f.rows.daily_session_enrolments[1].contracting_party_type,null);
 const audit=f.rows.selen_agent_assistance_logs[0];assert.equal(audit.agent_user_id,agent);assert.notEqual(audit.agent_user_id,f.context.user.id);assert.equal(audit.metadata.phase,'applied');assert.equal(audit.old_state.contracting_party_type,null);assert.equal(audit.new_state.contracting_party_type,'individual');
 assert.equal(audit.new_state.updated_at,f.row.updated_at); // Real SQL scope trigger owns the persisted timestamp.
 assert.equal(f.rpcCalls[0].p_token_hash,createHash('sha256').update('isolated-token').digest('hex'));
 assert.equal(f.writes[0].table,'selen_agent_assistance_logs');assert.equal(f.writes[1].table,'daily_session_enrolments');
});

test('délégation expirée, organisme étranger, agent désactivé et absence de confirmation : aucun changement',async()=>{
 for(const [change,extra,status]of[
  [f=>{f.context.assistance.expires_at='2000-01-01T00:00:00Z';},{},403],
  [f=>{f.context.assistance.organisation_id='foreign';},{},403],
  [f=>{f.flags.sqlDeny=true;},{},403],
  [f=>{f.context.assisted=false;},{},403],
  [()=>{},{confirm_delegated:false},400],
  [f=>{f.row.organisation_id='foreign';},{},404],
  [()=>{},{session_id:'another-session'},404],
  [f=>{f.row.status='cancelled';},{},409],
 ]){const f=fixture();change(f);assert.equal((await f.patch(extra)).status,status);assert.equal(f.writes.length,0);assert.equal(f.row.contracting_party_type,null);}
});

test('entreprise de session explicite requise, aucun SIRET ou financement utilisé comme choix',async()=>{
 const f=fixture();assert.equal((await f.patch({contracting_party_type:null,siret:'12345678901234'})).status,400);
 assert.equal((await f.patch({contracting_party_type:'company',company_name:'Autre entreprise'})).status,400);assert.equal(f.writes.length,0);
 assert.equal((await f.patch({contracting_party_type:'company',company_name:'Entreprise QA'})).status,200);assert.equal(f.row.company_name,'Entreprise QA');
});

test('un écran périmé et une concurrence entre lecture et écriture ne remplacent pas le choix récent',async()=>{
 const f=fixture();assert.equal((await f.patch({expected_updated_at:'2026-10-01T00:00:00Z'})).status,409);assert.equal(f.writes.length,0);
 f.flags.beforeUpdate=()=>{f.row.updated_at='2026-10-14T08:00:00Z';f.row.contracting_party_type='company';f.row.company_name='Entreprise QA';};
 assert.equal((await f.patch()).status,409);assert.equal(f.row.contracting_party_type,'company');assert.equal(f.writes.filter(w=>w.table==='daily_session_enrolments').length,0);assert.equal(f.rows.selen_agent_assistance_logs[0].metadata.phase,'requested');
});

test('un contrat existant est conservé et interdit le changement de partie',async()=>{
 const f=fixture();f.rows.daily_documents.push({organisation_id:org,session_id:session,is_current:true,status:'signed',document_type:'training_contract',linked_object_type:'enrolment',linked_object_id:id});
 assert.equal((await f.patch()).status,409);assert.equal(f.writes.length,0);assert.equal(f.rows.daily_documents[0].status,'signed');
});

test('l’échec du journal avant écriture bloque ; une clôture échouée ne prétend pas que le choix a échoué',async()=>{
 const f=fixture();f.flags.auditInsertError=true;assert.equal((await f.patch()).status,503);assert.equal(f.row.contracting_party_type,null);assert.equal(f.writes.length,0);
 const g=fixture();g.flags.auditFinalError=true;const response=await g.patch();assert.equal(response.status,503);const body=await response.json();assert.equal(body.saved,true);assert.equal(g.row.contracting_party_type,'individual');assert.equal(g.rows.selen_agent_assistance_logs[0].metadata.phase,'requested');assert.match(body.error,/choix est enregistré/);
});
