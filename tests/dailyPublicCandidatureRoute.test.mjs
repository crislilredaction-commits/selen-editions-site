import assert from 'node:assert/strict';
import test from 'node:test';
import * as crypto from 'node:crypto';
import { loadTypeScript } from './helpers/loadTypeScript.mjs';

const candidateId='11111111-1111-4111-8111-111111111111';
const formationA={
  id:'formation-a',user_id:'owner-a',organisation_id:'of-a',
  public_registration_token:'formation-token-a',public_registration_enabled:true,
  status:'validated',title:'Formation A',positioning_mode:'none'
};
const sessionA={
  id:'session-a',formation_id:'formation-a',user_id:'owner-a',organisation_id:'of-a',
  registration_token:'session-token-a',status:'ready',start_date:'2099-01-01',
  end_date:'2099-01-02',modality:'presentiel',distance_mode:null,
  daily_formations:formationA
};
const sessionB={
  id:'session-b',formation_id:'formation-b',user_id:'owner-b',organisation_id:'of-b',
  registration_token:'session-token-b',status:'ready',start_date:'2099-01-01',
  end_date:'2099-01-02',modality:'presentiel',distance_mode:null
};
const validBody={
  response_type:'beneficiary',respondent_first_name:'Alice',respondent_last_name:'Exemple',
  respondent_email:'alice@example.test',need_answers:{},positioning_answers:{},
  signature_consent:true,signature_data:'data:image/png;base64,ZmFrZQ=='
};

function fixture({insertError=false}={}){
  const records=[],emails=[];
  const tables={
    daily_sessions:[{...sessionA},{...sessionB}],
    daily_formations:[{...formationA}],
    daily_onboarding:[],
    daily_formation_registration_requests:[],
    daily_registration_responses:[],
  };
  const admin={from(table){
    assert.ok(Object.hasOwn(tables,table),'Unexpected table '+table);
    const filters=[];let operation='read',payload=null;
    const q={
      select(){return q;},
      eq(key,value){filters.push(row=>row[key]===value);return q;},
      neq(key,value){filters.push(row=>row[key]!==value);return q;},
      gte(key,value){filters.push(row=>String(row[key])>=String(value));return q;},
      order(){return q;},
      insert(value){operation='insert';payload=value;return q;},
      update(value){operation='update';payload=value;return q;},
      maybeSingle(){return Promise.resolve(execute(true));},
      single(){return Promise.resolve(execute(true));},
      then(resolve,reject){return Promise.resolve(execute(false)).then(resolve,reject);},
    };
    function execute(single){
      if(operation==='insert'){
        if(insertError)return {data:null,error:{message:'SQL relation secret_internal_table does not exist',code:'42P01'}};
        const row={...payload,status:table==='daily_formation_registration_requests'?'attached':'submitted'};
        tables[table].push(row);records.push({table,row});return{data:row,error:null};
      }
      const rows=tables[table].filter(row=>filters.every(fn=>fn(row)));
      if(operation==='update'){for(const row of rows)Object.assign(row,payload);return{data:rows,error:null};}
      return{data:single?rows[0]??null:rows,error:null};
    }
    return q;
  }};
  class OwnPositioningError extends Error{constructor(message,status=400){super(message);this.status=status;}}
  class PrerequisiteEvidenceError extends Error{constructor(message,status=400){super(message);this.status=status;}}
  const route=loadTypeScript('app/api/daily-registration/[token]/route.ts',{
    crypto,
    'next/server':{NextResponse:{json:(data,init)=>Response.json(data,init)}},
    '@/lib/server/clientNdaAccess':{getAdminSupabase:()=>admin},
    '@/lib/server/dailyRegistrationEmails':{sendDailyRegistrationConfirmation:async input=>{emails.push(input);return{sent:false};}},
    '@/lib/dailyBeneficiarySiret':{normalizeBeneficiarySiret:()=>null,validateOptionalBeneficiarySiret:()=>({valid:true,value:null})},
    '@/lib/daily/prerequisiteEvidence':{APPLICATION_PRIVATE_DOCUMENTS_MAX_BYTES:4_000_000},
    '@/lib/server/dailyOwnPositioning':{
      OwnPositioningError,loadOriginalPositioning:async()=>null,
      prepareOwnPositioning:async()=>null,persistOwnPositioning:async()=>{},
      positioningSubmissionAnswers:()=>({}),
      prepareJsonRegistrationSubmission:()=>({id:candidateId,fingerprint:'a'.repeat(64)}),
      selenCandidatePositioningAnswers:()=>({}),
    },
    '@/lib/server/dailyPrerequisiteEvidence':{
      PrerequisiteEvidenceError,preparePrerequisiteEvidence:async()=>null,
      persistPrerequisiteEvidence:async()=>{},replaceRejectedPrerequisiteEvidence:async()=>{},
    },
    '@/lib/dailyRegistration':{
      buildDailyRegistrationSummary:()=>({adaptation_needed:false}),
      DAILY_COMPANY_QUESTIONS:[],DAILY_NEED_QUESTIONS:[],DAILY_POSITIONING_QUESTIONS:[],
      detectAdaptationNeeded:()=>false,
    },
  },{Request,Response,Date,Intl,console});
  async function post(token,extra={}){
    const request=new Request('https://daily.example.test/api/daily-registration/'+token,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({...validBody,...extra}),
    });
    return route.POST(request,{params:Promise.resolve({token})});
  }
  return{post,records,emails,tables};
}

test('POST public réel : candidature de formation déposée sur la session du même OF sans inscription prématurée',async()=>{
  const h=fixture();
  const response=await h.post('formation-token-a',{selected_session_id:'session-a'});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.registrationKind,'formation');
  assert.equal(body.response.attached_session_id,'session-a');
  assert.equal(h.records.length,1);
  assert.equal(h.records[0].table,'daily_formation_registration_requests');
  assert.equal(h.records[0].row.formation_id,'formation-a');
  assert.equal(h.records[0].row.user_id,'owner-a');
  assert.equal(h.records[0].row.attached_session_id,'session-a');
  assert.equal(h.records[0].row.signature_proof_hash.length,64);
  assert.equal(h.emails.length,1);
  assert.equal(body.confirmationEmailSent,false);
});

test('POST public réel : impossible de rattacher une candidature de OF A à la session de OF B',async()=>{
  const h=fixture();
  const response=await h.post('formation-token-a',{selected_session_id:'session-b'});
  assert.equal(response.status,409);
  assert.match((await response.json()).error,/session choisie n.est plus disponible/i);
  assert.equal(h.records.length,0);
  assert.equal(h.emails.length,0);
});

for(const [label,token] of [['formation','formation-token-a'],['session','session-token-a']]){
  test('POST public '+label+' : une erreur SQL interne ne fuit jamais vers le candidat',async()=>{
    const h=fixture({insertError:true});
    const response=await h.post(token,token==='formation-token-a'?{selected_session_id:'session-a'}:{});
    assert.equal(response.status,500);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.json();
    assert.match(body.error,/candidature n.a pas pu être enregistrée/);
    assert.doesNotMatch(JSON.stringify(body),/SQL|secret_internal_table|42P01/i);
    assert.equal(h.records.length,0);
    assert.equal(h.emails.length,0);
  });
}
