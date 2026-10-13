import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { loadTypeScript } from './loadTypeScript.mjs';

export const uuid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const ids={org:uuid(1),owner:uuid(2),formation:uuid(3),session:uuid(4),oldFormation:uuid(5),oldSession:uuid(6),agent:uuid(7),profile:uuid(8),assistance:uuid(9),request:uuid(10),learner:uuid(11),enrolment:uuid(12),foreignOrg:uuid(13),foreignFormation:uuid(14),foreignSession:uuid(15),foreignRequest:uuid(16)};
export const token='isolated-delegation-token';
export const tokenHash=crypto.createHash('sha256').update(token).digest('hex');

export async function delegatedHarness() {
  const db=new PGlite();
  await db.exec(await readFile(new URL('../fixtures/dailyOwnPositioningSchema.sql',import.meta.url),'utf8'));
  await db.exec(`
    create schema auth; create table auth.users(id uuid primary key);
    create table organisations(id uuid primary key);
    create table agent_profiles(id uuid primary key,user_id uuid,email text,first_name text,last_name text,role text,is_active boolean);
    create table selen_admin_users(id uuid primary key,user_id uuid,email text,is_active boolean);
    create table selen_agent_assistance_tokens(id uuid primary key,token_hash text unique,agent_user_id uuid,agent_email text,organisation_id uuid,dossier_id uuid,status text,expires_at timestamptz,metadata jsonb);
    create table selen_agent_assistance_logs(id uuid primary key default gen_random_uuid(),assistance_token_id uuid references selen_agent_assistance_tokens(id) on delete set null,agent_user_id uuid,agent_email text,organisation_id uuid,dossier_id uuid,action text,action_label text,old_state jsonb,new_state jsonb,metadata jsonb,created_at timestamptz default now());
    create table daily_registration_request_decisions(id uuid primary key default gen_random_uuid(),registration_request_id uuid references daily_formation_registration_requests(id),organisation_id uuid,actor_type text not null,actor_user_id uuid not null references auth.users(id),trainer_profile_id uuid,decision text,comment text,decided_at timestamptz default now(),
      constraint daily_registration_request_decisions_actor_type_check check(actor_type in ('organisation','trainer')),
      constraint daily_registration_request_decisions_trainer_actor_check check((actor_type='trainer' and trainer_profile_id is not null) or (actor_type='organisation' and trainer_profile_id is null)),
      unique(registration_request_id,actor_type,actor_user_id));
    create table daily_prerequisite_evidence(id uuid primary key default gen_random_uuid(),registration_request_id uuid);
    create table daily_trainer_profiles(id uuid,organisation_id uuid,user_id uuid,active boolean,status text);
    alter table daily_formation_registration_requests add column prerequisite_contract jsonb;
    alter role service_role bypassrls;
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261013195000_daily_historical_session_reconciliation.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/20261013210217_daily_studio_delegated_registration_decisions.sql',import.meta.url),'utf8'));
  await db.exec('grant usage on schema public to service_role; grant all on all tables in schema public to service_role;');
  const tables=(await db.query("select tablename from pg_tables where schemaname='public'")).rows.map(row=>row.tablename);
  const flags={forceFallback:false,authError:false}; const sends=[],requests=[],rpcCalls=[];
  const q=async(sql,values=[])=>db.query(sql,values);
  async function insert(table,row){const columns=Object.keys(row),values=Object.values(row).map(v=>v&&typeof v==='object'?JSON.stringify(v):v);return(await q(`insert into public.${table} (${columns.join(',')}) values (${values.map((_,i)=>`$${i+1}`).join(',')}) returning *`,values)).rows[0];}
  const baseFormation={organisation_id:ids.org,user_id:ids.owner,title:'Formation exemple',global_objective:'Objectif stable',target_audience:'Public',prerequisites:'Aucun prérequis',duration_hours:14,duration_days:2,modality:'presentiel',modality_details:'Salle',access_delays:'Inscription',registration_methods:'Candidature',price:'100',detailed_program:'Programme',accessibility:'Contact',pedagogical_resources:'Supports',evaluation_methods:'Évaluation',contact_phone:'0102030405',contact_email:'of@example.test',status:'validated'};
  async function reset(){
    await db.exec(`truncate ${tables.map(table=>`public.${table}`).join(',')} cascade; truncate auth.users cascade;`);
    flags.forceFallback=false;flags.authError=false;sends.length=0;requests.length=0;rpcCalls.length=0;
    await q('insert into auth.users values($1),($2)',[ids.owner,ids.agent]);
    await insert('organisations',{id:ids.org}); await insert('organisations',{id:ids.foreignOrg});
    await insert('agent_profiles',{id:ids.profile,user_id:ids.agent,email:'agent@example.test',first_name:'Agent',last_name:'Réel',role:'agent',is_active:true});
    await insert('selen_agent_assistance_tokens',{id:ids.assistance,token_hash:tokenHash,agent_user_id:ids.agent,agent_email:'agent@example.test',organisation_id:ids.org,status:'active',expires_at:new Date(Date.now()+1800000).toISOString(),metadata:{scope:'daily_workspace'}});
    await insert('daily_formations',{...baseFormation,id:ids.oldFormation,status:'archived'});
    await insert('daily_formations',{...baseFormation,id:ids.formation,previous_version_id:ids.oldFormation});
    await insert('daily_formations',{...baseFormation,id:ids.foreignFormation,organisation_id:ids.foreignOrg,title:'Formation étrangère'});
    for(const [id,formation_id,organisation_id,start_date] of [[ids.session,ids.formation,ids.org,'2026-11-28'],[ids.oldSession,ids.oldFormation,ids.org,'2026-10-12'],[ids.foreignSession,ids.foreignFormation,ids.foreignOrg,'2026-11-28']])await insert('daily_sessions',{id,formation_id,organisation_id,user_id:ids.owner,modality:'presentiel',status:'ready',start_date,end_date:start_date});
    const request={user_id:ids.owner,response_type:'beneficiary',respondent_first_name:'Alice',respondent_last_name:'Exemple',respondent_email:'alice@example.test',decision_status:'ready_for_of',agent_analysis_completed_at:new Date().toISOString(),prerequisites_validated:true,prerequisite_contract:{mode:'none',requirements:[]},submitted_at:new Date().toISOString()};
    await insert('daily_formation_registration_requests',{...request,id:ids.request,formation_id:ids.formation,attached_session_id:ids.session});
    await insert('daily_formation_registration_requests',{...request,id:ids.foreignRequest,formation_id:ids.foreignFormation,respondent_first_name:'Foreign'});
  }
  const admin={from(table){
    assert.ok(tables.includes(table),`Unexpected table ${table}`);
    const filters=[];let one=false,columns='*',orders=[];
    const query={select(value){columns=value;return query;},eq(k,v){filters.push(row=>row[k]===v);return query;},neq(k,v){filters.push(row=>row[k]!==v);return query;},in(k,v){filters.push(row=>v.includes(row[k]));return query;},not(k,op,v){assert.equal(op,'in');filters.push(row=>!v.slice(1,-1).split(',').includes(row[k]));return query;},order(k,{ascending=true}={}){orders.push([k,ascending]);return query;},single(){one=true;return query;},maybeSingle(){one=true;return query;},then(resolve,reject){return(async()=>{
      let rows=JSON.parse(JSON.stringify((await q(`select * from public.${table}`)).rows)).filter(row=>filters.every(f=>f(row)));
      for(const [k,asc]of orders)rows.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(asc?1:-1));
      if(columns!=='*')rows=rows.map(row=>Object.fromEntries(columns.split(',').filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]])));
      return{data:one?rows[0]??null:rows,error:null};
    })().then(resolve,reject);}};return query;
  },async rpc(name,args){
    assert.equal(name,'daily_decide_delegated_registration_request','Must never impersonate the OF through a manager RPC');rpcCalls.push(args);
    return call(args);
  }};
  async function call(args){
    const defaults={p_request_id:ids.request,p_assistance_id:ids.assistance,p_token_hash:tokenHash,p_action:'accepted',p_session_id:ids.session,p_comment:null,p_confirmed:true,p_historical_reason:null};
    const values=Object.values({...defaults,...args});
    try{
      await db.exec('set role service_role');
      return{data:(await q('select public.daily_decide_delegated_registration_request($1,$2,$3,$4,$5,$6,$7,$8) as result',values)).rows[0].result,error:null};
    }catch(error){return{data:null,error:{message:error.message,code:error.code}};}
    finally{await db.exec('reset role');}
  }
  const guard=loadTypeScript('lib/server/dailyDelegatedRegistrationDecision.ts',{'node:crypto':crypto},{Date,Error});
  const api=loadTypeScript('app/api/client/daily/registration-requests/route.ts',{
    'next/server':{NextResponse:{json:Response.json}},
    '@/lib/server/dailyDelegatedRegistrationDecision':guard,
    '@/lib/server/clientNdaAccess':{getAdminSupabase:()=>admin},
    '@/lib/server/dailyClientWorkspace':{getDailyClientWorkspace:async()=>({ok:true,user:{id:ids.owner},workspace:{membership:{organisation_id:ids.org,roles:['manager']}}})},
    '@/lib/server/dailyOrganisationContext':{getDailyOrganisationReadContext:async req=>{
      if(flags.authError)return{ok:false,status:401,error:'Connexion requise.'};
      const provided=req?.headers?.get('x-selen-agent-assistance');
      if(provided!==token||flags.forceFallback)return{ok:true,admin,organisationId:ids.org,user:{id:ids.owner},assisted:false};
      const assistance=(await q('select * from selen_agent_assistance_tokens where id=$1',[ids.assistance])).rows[0];
      return{ok:true,admin,organisationId:ids.org,user:{id:ids.owner},assisted:true,assistance};
    }},
    '@/lib/server/dailyLearnerPortalAccess':{sendLearnerPortalAccessForRegistrationRequest:async(_admin,input)=>{sends.push({kind:'learner',...input});return[{status:'sent',email:'alice@example.test'}];}},
    '@/lib/server/dailyEnterprisePortalAccess':{sendEnterprisePortalAccessForRegistrationRequest:async(_admin,input)=>{sends.push({kind:'enterprise',...input});return[];}},
  },{URL,Date,Error,console:{error(){}},fetch(){assert.fail('Real network forbidden');}});
  function request(body,provided=token){return new Request('https://daily.example.test/api/client/daily/registration-requests',{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(provided?{'x-selen-agent-assistance':provided}:{})},...(body?{body:JSON.stringify({request_id:ids.request,confirm_delegated:true,...body})}:{})});}
  async function fetcher(url,init){assert.equal(url,'/api/client/daily/registration-requests');const req=new Request(`https://daily.example.test${url}`,init);requests.push(req);return init?.method==='POST'?api.POST(req):api.GET(req);}
  await reset();
  return{db,q,reset,insert,call,flags,guard,api,request,fetcher,sends,requests,rpcCalls};
}
