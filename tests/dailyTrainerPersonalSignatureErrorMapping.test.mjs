import assert from 'node:assert/strict';
import test from 'node:test';
import * as nodeCrypto from 'node:crypto';
import {loadTypeScript} from './helpers/loadTypeScript.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5N8AAAAASUVORK5CYII=','base64');
const api=loadTypeScript('lib/server/dailyTrainerPersonalSignature.ts',{
 'node:crypto':nodeCrypto,
 'next/server':{NextResponse:{json:Response.json}},
 '@/lib/server/dailyTrainerWorkspaceContext':{getAssignedDailyTrainerSession:async()=>({id:'session-test'})},
},{Buffer,Error});

async function invoke(rpcResult){
 const uploads=[],removed=[];
 const context={orgId:'org-test',trainerId:'trainer-test',user:{id:'user-test',email:'trainer@example.test'},admin:{
  storage:{from:()=>({upload:async path=>{uploads.push(path);return {error:null};},remove:async paths=>{removed.push(...paths);return {error:null};}})},
  rpc:async()=>rpcResult,
 }};
 const form=new FormData();form.set('session_id','session-test');form.set('slot_id','slot-test');form.set('signature_consent','true');form.set('signature_data','data:image/png;base64,'+png.toString('base64'));
 const response=await api.recordDailyTrainerPersonalSignature(new Request('https://daily.example.test/sign'),context,form);
 return {status:response.status,body:await response.json(),uploads,removed};
}

test('signature personnelle : les erreurs SQL ne révèlent pas les informations internes',async()=>{
 for(const [code,status,expected] of [
  ['42501',403,'Connectez-vous avec le compte personnel rattaché à ce formateur.'],
  ['22023',400,'Créneau ou preuve de signature invalide.'],
  ['23505',409,'Une signature existe déjà pour ce créneau.'],
  ['23514',500,'Enregistrement de la signature indisponible.'],
  ['PGRST116',500,'Enregistrement de la signature indisponible.'],
 ]){
  const r=await invoke({error:{code,message:'SQL INTERNAL: private organisation_id and schema details'},data:null});
  assert.equal(r.status,status,code);assert.equal(r.body.error,expected,code);
  assert.ok(!JSON.stringify(r.body).includes('SQL INTERNAL'),code);
  assert.equal(r.uploads.length,1,code);assert.deepEqual(r.removed,r.uploads,code);
 }
});

test('signature personnelle : une réussite conserve la preuve, un rejeu nettoie le doublon',async()=>{
 const success=await invoke({data:{signature_id:'signature-test',replayed:false},error:null});
 assert.equal(success.status,200);assert.equal(success.body.ok,true);assert.equal(success.body.signature_id,'signature-test');assert.equal(success.removed.length,0);
 const replay=await invoke({data:{signature_id:'signature-test',replayed:true},error:null});
 assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.deepEqual(replay.removed,replay.uploads);
});
