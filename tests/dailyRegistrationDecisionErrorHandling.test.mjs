import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './helpers/loadTypeScript.mjs';

const SECRET='SQL relation secret_registration_decisions does not exist';
function fixture({assisted=false,manager=true,readError=false,rpcError=null,foreignSession=false}={}) {
  let rpcCalls=0,notifications=0;
  const admin={
    from(table) {
      const q={select(){return q;},eq(){return q;},not(){return q;},
        maybeSingle(){return Promise.resolve(result(true));},
        then(resolve,reject){return Promise.resolve(result(false)).then(resolve,reject);}};
      function result(single) {
        if(table==='daily_trainer_profiles')return{data:null,error:null};
        if(table==='daily_formation_registration_requests')return{data:{id:'request-a',formation_id:'formation-a'},error:null};
        if(table==='daily_formations')return readError?{data:null,error:{message:SECRET,code:'42P01'}}:{data:single?{id:'formation-a'}:[{id:'formation-a',title:'Formation A'}],error:null};
        if(table==='daily_sessions')return{data:foreignSession?null:{id:'session-a'},error:null};
        throw Error('Unexpected table '+table);
      }
      return q;
    },
    async rpc(){rpcCalls++;return{data:null,error:rpcError};},
  };
  const noSend=async()=>{notifications++;throw Error('Unexpected notification');};
  const route=loadTypeScript('app/api/client/daily/registration-requests/route.ts',{
    'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    '@/lib/server/clientNdaAccess':{getAdminSupabase:()=>admin},
    '@/lib/server/dailyClientWorkspace':{getDailyClientWorkspace:async()=>({ok:true,user:{id:'owner-a'},workspace:{membership:{organisation_id:'of-a',roles:manager?['manager']:[]}}})},
    '@/lib/server/dailyOrganisationContext':{getDailyOrganisationReadContext:async()=>({ok:true,admin,organisationId:'of-a',user:{id:'owner-a'},assisted,assistance:assisted?{id:'assistance-a'}:null})},
    '@/lib/server/dailyDelegatedRegistrationDecision':{
      registrationAssistanceToken:()=>assisted?'delegated-token':null,
      assertDelegatedRegistrationDecision:()=>({assistanceId:'assistance-a',agentUserId:'agent-a'}),
      delegatedRegistrationTokenHash:()=> 'token-hash',
      getDelegatedRegistrationActor:()=>({}),
    },
    '@/lib/server/dailyLearnerPortalAccess':{sendLearnerPortalAccessForRegistrationRequest:noSend},
    '@/lib/server/dailyEnterprisePortalAccess':{sendEnterprisePortalAccessForRegistrationRequest:noSend},
  },{Request,Response,Date,Error,console});
  const request=body=>new Request('https://daily.example.test/api/client/daily/registration-requests',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({request_id:'request-a',actor_type:'organisation',decision:'accepted',session_id:'session-a',confirm_delegated:true,...body}),
  });
  return{route,request,get rpcCalls(){return rpcCalls;},get notifications(){return notifications;}};
}
async function safe(response,status,pattern){
  assert.equal(response.status,status);
  const body=await response.json();assert.match(body.error,pattern);
  assert.doesNotMatch(JSON.stringify(body),/SQL|secret_registration_decisions|42P01/i);
}
test('P0-01 lecture OF : erreur SQL masquée',async()=>{
  const h=fixture({readError:true});
  await safe(await h.route.GET(new Request('https://daily.example.test/api/client/daily/registration-requests')),503,/chargement.*indisponible/i);
  assert.equal(h.rpcCalls,0);
});
test('P0-01 décision OF : SQL masqué, pas de notification',async()=>{
  const h=fixture({rpcError:{message:SECRET,code:'42P01'}});
  await safe(await h.route.POST(h.request()),503,/décision.*indisponible/i);
  assert.equal(h.rpcCalls,1);assert.equal(h.notifications,0);
});
test('P0-01 décision Studio déléguée : SQL masqué, pas de notification',async()=>{
  const h=fixture({assisted:true,rpcError:{message:SECRET,code:'42P01'}});
  await safe(await h.route.POST(h.request()),503,/décision.*indisponible/i);
  assert.equal(h.rpcCalls,1);assert.equal(h.notifications,0);
});
test('P0-01 analyse humaine obligatoire : conflit métier explicite',async()=>{
  const h=fixture({rpcError:{message:'analysis required',code:'P0001'}});
  await safe(await h.route.POST(h.request()),409,/analyse Selen/i);
  assert.equal(h.rpcCalls,1);assert.equal(h.notifications,0);
});
test('P0-01 session d’un autre OF : refus avant RPC',async()=>{
  const h=fixture({foreignSession:true});
  const response=await h.route.POST(h.request());
  assert.equal(response.status,403);assert.match((await response.json()).error,/hors du périmètre/i);
  assert.equal(h.rpcCalls,0);assert.equal(h.notifications,0);
});
test('P0-01 acteur non manager : refus avant RPC',async()=>{
  const h=fixture({manager:false});
  const response=await h.route.POST(h.request());
  assert.equal(response.status,403);assert.equal(h.rpcCalls,0);assert.equal(h.notifications,0);
});
test('P0-01 contrainte unique : conflit non divulgué',async()=>{
  const h=fixture({rpcError:{message:'duplicate key violates unique constraint secret_registration_decisions',code:'23505'}});
  await safe(await h.route.POST(h.request()),409,/déjà reçu une décision/i);
  assert.equal(h.notifications,0);
});

for(const code of ['23502','23514','P0001']) test('P0-01 échec atomique '+code+' : conflit sans fuite SQL ni notification',async()=>{
  const h=fixture({rpcError:{message:'SQL constraint secret_registration_decisions failed',code}});
  await safe(await h.route.POST(h.request()),409,/décision.*finalisée/i);
  assert.equal(h.rpcCalls,1);assert.equal(h.notifications,0);
});

test('P0-01 échec de matérialisation sans code SQL : conflit sûr et aucune notification',async()=>{
  const h=fixture({rpcError:{message:'materialization failed'}});
  await safe(await h.route.POST(h.request()),409,/inscription.*finalisée/i);
  assert.equal(h.rpcCalls,1);assert.equal(h.notifications,0);
});
