import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from './helpers/loadTypeScript.mjs';
import { harness } from './helpers/dailyOwnPositioningHarness.mjs';

function fixture({positioning='completed',prerequisites='met',enrolmentStatus='pending',sessionStatus='ready',formationStatus='validated',forbidden=false}={}) {
  const organisationId='org-own',userId='user-own';
  const session={id:'session-own',organisation_id:organisationId,status:sessionStatus,trainer_ids:['trainer-own'],daily_formations:{title:'Formation QA',status:formationStatus}};
  const enrolment={id:'enrolment-own',organisation_id:organisationId,session_id:session.id,status:enrolmentStatus,positioning_status:positioning,prerequisites_status:prerequisites,daily_learners:{first_name:'Alice',last_name:'Martin'},daily_sessions:session};
  const rows={daily_sessions:[session],daily_session_enrolments:[enrolment,{...enrolment,id:'enrolment-foreign',organisation_id:'org-other'}],daily_session_checklist_items:[],daily_enrolment_support_needs:[],daily_onboarding:[{user_id:userId,support_tasks:[],quality_tracking_enabled:false}],organisations:[{id:organisationId,qualiopi_status:'none'}],daily_business_watch_entries:[],daily_quality_actions:[],daily_formations:[],client_reminders:[]};
  const reads=[];
  const admin={from(table){
    assert.ok(Object.hasOwn(rows,table),`Unexpected table ${table}`);reads.push(table);
    const filters=[];let single=false;
    const query={select(){return query},eq(k,v){filters.push(row=>row[k]===v);return query},neq(k,v){filters.push(row=>row[k]!==v);return query},in(k,v){filters.push(row=>v.includes(row[k]));return query},not(k,op,value){assert.equal(op,'in');const values=value.slice(1,-1).split(',');filters.push(row=>!values.includes(row[k]));return query},gte(k,v){filters.push(row=>row[k]>=v);return query},lt(k,v){filters.push(row=>row[k]<v);return query},lte(k,v){filters.push(row=>row[k]<=v);return query},order(){return query},limit(){return query},maybeSingle(){single=true;return query},then(resolve,reject){const data=rows[table].filter(row=>filters.every(predicate=>predicate(row)));return Promise.resolve({data:single?data[0]??null:data,error:null}).then(resolve,reject)}};
    return query;
  }};
  const completion=harness().load('lib/server/dailySessionCompletion.ts');
  const route=loadTypeScript('app/api/client/daily/action-center/route.ts',{
    'next/server':{NextResponse:{json:Response.json}},
    '@/lib/server/dailySessionCompletion':completion,
    '@/lib/server/dailyOrganisationContext':{
      getDailyOrganisationReadContext:async(_request,capabilities)=>{assert.equal(capabilities[0],'sessions');assert.equal(capabilities[1],'trainings');return forbidden?{ok:false,error:'Forbidden',status:403}:{ok:true,admin,organisationId,user:{id:userId},capabilities:{trainers_all:false},assisted:false}},
      getDailyOrganisationBillingUserId:async(org,user)=>{assert.equal(org,organisationId);assert.equal(user,userId);return userId},
    },
  },{Date,fetch(){throw Error('Network forbidden')}});
  return {rows,enrolment,reads,get:()=>route.GET(new Request('https://site.test/api/client/daily/action-center'))};
}

for(const status of ['reviewed','completed','validated','done'])test(`finished positioning ${status} is absent from active actions and counters`,async()=>{
  const f=fixture({positioning:status});const response=await f.get();assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.actions.length,0);assert.equal(body.counts.total,0);assert.equal(body.counts.learners,0);
  assert.equal(f.enrolment.positioning_status,status,'read-only aggregation preserves history');
});
for(const status of ['not_started','sent','submitted'])test(`unfinished positioning ${status} remains actionable`,async()=>{
  const f=fixture({positioning:status});const response=await f.get();assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.actions.length,1);assert.equal(body.actions[0].id,'positioning:enrolment-own');
  assert.equal(body.actions[0].kind,'positioning');assert.equal(body.counts.learners,1);assert.equal(body.counts.total,1);
  assert.equal(body.actions[0].priority,status==='submitted'?'medium':'normal');
});
test('completed positioning does not hide unvalidated prerequisites',async()=>{
  const f=fixture({prerequisites:'not_reviewed'});const response=await f.get();const body=await response.json();
  assert.equal(body.actions.length,1);assert.equal(body.actions[0].kind,'prerequisite');assert.equal(body.counts.learners,1);
  assert.equal(f.enrolment.prerequisites_status,'not_reviewed');
});
test('a replaced questionnaire makes positioning actionable again',async()=>{
  const f=fixture();assert.equal((await (await f.get()).json()).counts.learners,0);
  f.enrolment.positioning_status='not_started';
  const body=await (await f.get()).json();assert.equal(body.counts.learners,1);assert.equal(body.actions[0].kind,'positioning');
});
test('closed enrolments and archived sessions do not create positioning actions',async()=>{
  for(const status of ['cancelled','declined','completed','abandoned']) {
    const f=fixture({enrolmentStatus:status,positioning:'not_started'});assert.equal((await (await f.get()).json()).counts.learners,0);
  }
  const f=fixture({sessionStatus:'archived',positioning:'not_started'});assert.equal((await (await f.get()).json()).counts.learners,0);
  const archivedFormation=fixture({formationStatus:'archived',positioning:'not_started'});assert.equal((await (await archivedFormation.get()).json()).counts.learners,0);
});
test('unauthorized OF reads are refused before any table read',async()=>{
  const f=fixture({forbidden:true});assert.equal((await f.get()).status,403);assert.equal(f.reads.length,0);
});
