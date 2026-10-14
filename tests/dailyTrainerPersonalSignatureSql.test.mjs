import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {delegatedHarness,ids,uuid,tokenHash} from './helpers/delegatedRegistrationHarness.mjs';
import {loadTypeScript} from './helpers/loadTypeScript.mjs';
import * as nodeCrypto from 'node:crypto';

test('signature personnelle : transaction PostgreSQL et véritable endpoint',async t=>{
 const h=await delegatedHarness();t.after(()=>h.db.close());
 await h.db.exec(`alter table daily_trainer_profiles add column professional_email text,add column display_name text;
 create table daily_attendance_slots(id uuid primary key,organisation_id uuid,session_id uuid,slot_date date,starts_at time,ends_at time,status text);
 create table daily_audit_logs(id uuid default gen_random_uuid(),organisation_id uuid,actor_user_id uuid,actor_type text,actor_role text,object_type text,object_id uuid,action text,occurred_at timestamptz,after_data jsonb,context jsonb,origin text);`);
 await h.db.exec(await readFile(new URL('../supabase/migrations/20261014012515_daily_trainer_personal_signature.sql',import.meta.url),'utf8'));
 await h.db.exec('grant all on all tables in schema public to service_role');
 const trainer=uuid(21),slot=uuid(22),document=uuid(23),hash='d'.repeat(64);
 const path=id=>`daily/${ids.org}/trainer/${trainer}/${ids.session}/trainer_signature/${id}.png`;
 async function reset(){await h.db.exec('truncate daily_attendance_slots,daily_audit_logs');await h.reset();await h.insert('daily_trainer_profiles',{id:trainer,organisation_id:ids.org,user_id:ids.owner,active:true,status:'validated',professional_email:'trainer@example.test',display_name:'Formateur QA'});await h.q('update daily_sessions set trainer_ids=$1 where id=$2',[JSON.stringify([trainer]),ids.session]);await h.insert('daily_attendance_slots',{id:slot,organisation_id:ids.org,session_id:ids.session,slot_date:'2000-01-01',starts_at:'09:00',ends_at:'12:00',status:'open'});}
 async function call(overrides={}){const args={p_document_id:document,p_organisation_id:ids.org,p_session_id:ids.session,p_trainer_id:trainer,p_actor_user_id:ids.owner,p_slot_id:slot,p_storage_path:path(document),p_sha256:hash,p_size_bytes:128,p_confirmed:true,p_actor_email:'trainer@example.test',...overrides};try{await h.db.exec('set role service_role');return{data:(await h.q('select daily_record_trainer_presence_signature($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result',Object.values(args))).rows[0].result,error:null};}catch(error){return{error};}finally{await h.db.exec('reset role');}}
 const count=async(table)=>(await h.q(`select count(*)::int as n from ${table}`)).rows[0].n;
 await t.test('identité, créneau, session et heure réelle conservés avec l’audit',async()=>{await reset();const r=await call();assert.equal(r.error,null);const doc=(await h.q('select * from daily_documents where id=$1',[document])).rows[0];assert.equal(doc.status,'signed');assert.equal(doc.created_by,ids.owner);assert.equal(doc.metadata.trainer_profile_id,trainer);assert.equal(doc.metadata.slot_id,slot);assert.equal(doc.metadata.slot_date,'2000-01-01');assert.ok(new Date(doc.signed_at)>new Date('2026-01-01'));assert.equal(doc.sha256,hash);assert.equal(await count('daily_audit_logs'),1);});
 for(const [label,sql,args,code]of[
  ['autre auteur','select 1',{p_actor_user_id:ids.agent},'42501'],
  ['profil non lié et email différent','update daily_trainer_profiles set user_id=null',{p_actor_email:'foreign@example.test'},'42501'],
  ['profil non lié et email absent','update daily_trainer_profiles set user_id=null',{p_actor_email:null},'42501'],
  ['formateur désactivé','update daily_trainer_profiles set active=false',{},'42501'],
  ['session non affectée',`update daily_sessions set trainer_ids='[]' where id='${ids.session}'`,{},'42501'],
  ['organisation étrangère','select 1',{p_organisation_id:ids.foreignOrg},'42501'],
  ['créneau étranger',`update daily_attendance_slots set session_id='${ids.foreignSession}'`,{},'22023'],
  ['créneau futur',"update daily_attendance_slots set slot_date=current_date+2",{},'22023'],
  ['absence de consentement','select 1',{p_confirmed:false},'22023'],
  ['preuve non intègre','select 1',{p_sha256:''},'22023'],
 ])await t.test(`refus : ${label}`,async()=>{await reset();await h.db.exec(sql);const r=await call(args);assert.equal(r.error?.code,code,r.error?.message);assert.equal(await count('daily_documents'),0);assert.equal(await count('daily_audit_logs'),0);});
 await t.test('rejeu conserve une seule signature ; contenu différent refusé',async()=>{await reset();const a=await call(),b=await call({p_document_id:uuid(24),p_storage_path:path(uuid(24))});assert.equal(a.error,null);assert.equal(b.error,null);assert.equal(b.data.replayed,true);assert.equal(b.data.signature_id,document);assert.equal(await count('daily_documents'),1);assert.equal(await count('daily_audit_logs'),1);assert.equal((await call({p_sha256:'e'.repeat(64)})).error?.code,'23505');});
 await t.test('audit indisponible : aucune signature persistée',async()=>{await reset();await h.db.exec("alter table daily_audit_logs add constraint reject_audit check(action='impossible')");try{assert.equal((await call()).error?.code,'23514');assert.equal(await count('daily_documents'),0);}finally{await h.db.exec('alter table daily_audit_logs drop constraint reject_audit');}});
 await t.test('preuve signée immuable et écriture directe navigateur interdite',async()=>{await reset();assert.equal((await call()).error,null);await assert.rejects(h.q('update daily_documents set metadata=$1 where id=$2',[{},document]),e=>e.code==='42501');await h.db.exec('grant insert on daily_documents to authenticated;set role authenticated');try{await assert.rejects(h.q("insert into daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,version,status,logical_name,bucket,storage_path,is_current) values($1,'trainer_signature_evidence','session',$2,1,'signed','Invalid','documents','invalid',true)",[ids.org,ids.session]),e=>e.code==='42501');}finally{await h.db.exec('reset role');}});
 await t.test('délégation documentaire active et auteur exact ; agent désactivé refusé',async()=>{await reset();let r=await h.q('select daily_assert_document_delegation($1,$2,$3) as actor',[ids.assistance,tokenHash,ids.org]);assert.equal(r.rows[0].actor,ids.agent);await h.db.exec('update agent_profiles set is_active=false');await assert.rejects(h.q('select daily_assert_document_delegation($1,$2,$3)',[ids.assistance,tokenHash,ids.org]),e=>e.code==='42501');});
 await t.test('API ne signe pas en délégation et nettoie le fichier si SQL refuse',async()=>{
  await reset();const uploads=[],removed=[];const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5N8AAAAASUVORK5CYII=','base64');
  const admin={storage:{from:()=>({upload:async(p)=>{uploads.push(p);return{error:null};},remove:async(p)=>{removed.push(...p);}})},rpc:async()=>({error:{code:'42501',message:'personal identity required'},data:null})};
  const api=loadTypeScript('lib/server/dailyTrainerPersonalSignature.ts',{'node:crypto':nodeCrypto,'next/server':{NextResponse:{json:Response.json}},'@/lib/server/dailyTrainerWorkspaceContext':{getAssignedDailyTrainerSession:async()=>({id:ids.session})}},{Buffer,Error});
  const body=new FormData();for(const[k,v]of Object.entries({session_id:ids.session,slot_id:slot,signature_consent:'true',signature_data:'data:image/png;base64,'+png.toString('base64')}))body.set(k,v);
  const context={admin,orgId:ids.org,trainerId:trainer,user:{id:ids.owner,email:'trainer@example.test'}};
  assert.equal((await api.recordDailyTrainerPersonalSignature(new Request('https://daily.example.test/sign',{headers:{'x-selen-agent-assistance':'test-only'}}),context,body)).status,403);assert.equal(uploads.length,0);
  assert.equal((await api.recordDailyTrainerPersonalSignature(new Request('https://daily.example.test/sign'),context,body)).status,403);assert.deepEqual(removed,uploads);
 });
});
