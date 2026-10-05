import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const migration=await fs.readFile(new URL('../supabase/migrations/20261005121733_daily_formation_creation_retry.sql',import.meta.url),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('creation receipt is additive, keeps RLS and uses PostgreSQL uniqueness to prevent repeated side effects',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec('create table daily_formations(id uuid primary key,title text,status text); alter table daily_formations enable row level security; create table qa_creation_events(formation_id uuid); create function qa_track_creation() returns trigger language plpgsql as $$ begin insert into qa_creation_events values(new.id);return new;end $$; create trigger qa_track_creation before insert on daily_formations for each row execute function qa_track_creation();');
 await db.query("insert into daily_formations values($1,'Historique intact','validated')",[id(1)]);
 await db.exec(migration);await db.exec(migration);
 await t.test('existing formation stays unchanged, nullable and protected by RLS',async()=>{
  assert.deepEqual((await db.query('select * from daily_formations where id=$1',[id(1)])).rows[0],{id:id(1),title:'Historique intact',status:'validated',creation_submission_fingerprint:null});
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='daily_formations'::regclass")).rows[0].relrowsecurity,true);
 });
 await t.test('a repeated primary-key insertion rolls back its trigger side effect',async()=>{
  await db.query("insert into daily_formations values($1,'Programme importé','draft',$2)",[id(2),'a'.repeat(64)]);
  await assert.rejects(db.query("insert into daily_formations values($1,'Programme importé','draft',$2)",[id(2),'a'.repeat(64)]),e=>e.code==='23505');
  assert.equal((await db.query('select count(*)::int n from qa_creation_events where formation_id=$1',[id(2)])).rows[0].n,1);
 });
 await t.test('invalid receipt is refused and rolls back its trigger side effect',async()=>{
  await assert.rejects(db.query("insert into daily_formations values($1,'Invalid','draft','forged')",[id(3)]),e=>e.code==='23514');
  assert.equal((await db.query('select count(*)::int n from qa_creation_events where formation_id=$1',[id(3)])).rows[0].n,0);
 });
 await t.test('later programme review preserves the original receipt',async()=>{
  await db.query("update daily_formations set title='Programme relu',status='validated' where id=$1",[id(2)]);
  assert.equal((await db.query('select creation_submission_fingerprint f from daily_formations where id=$1',[id(2)])).rows[0].f,'a'.repeat(64));
 });
});
