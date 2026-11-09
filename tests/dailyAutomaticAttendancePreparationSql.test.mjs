import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20261109091916_daily_automatic_attendance_preparation.sql', import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const blocks = JSON.stringify([{date:'2026-11-09',start:'09:00',end:'18:00',note:''},{date:'2026-11-10',start:'09:00',end:'18:00',note:'Jour 2'}]);

test('ready sessions prepare attendance atomically, including subsequent enrolments', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create table daily_sessions (id uuid primary key, organisation_id uuid, status text, modality text, distance_mode text, schedule_blocks jsonb);
    create table daily_session_enrolments (id uuid primary key, organisation_id uuid, session_id uuid, status text);
    create table daily_attendance_slots (id uuid primary key default gen_random_uuid(), organisation_id uuid, session_id uuid, slot_key text, slot_date date, starts_at time, ends_at time, mode text, label text, status text, unique(session_id,slot_key), check(ends_at>starts_at));
    create table daily_attendance_records (organisation_id uuid, session_id uuid, slot_id uuid, enrolment_id uuid, status text, unique(slot_id,enrolment_id));
  `);
  await db.exec(migration);
  const session = async (n, status='ready', modality='presentiel', distance=null) => db.query('insert into daily_sessions values ($1,$2,$3,$4,$5,$6)',[id(n),id(100),status,modality,distance,blocks]);
  const enrol = async (n,s,status='confirmed',org=id(100)) => db.query('insert into daily_session_enrolments values($1,$2,$3,$4)',[id(n),org,id(s),status]);
  const slots = async n => (await db.query('select * from daily_attendance_slots where session_id=$1 order by slot_key',[id(n)])).rows;
  const records = async n => (await db.query('select * from daily_attendance_records where session_id=$1',[id(n)])).rows;

  await t.test('reported incident: ready session with no manual preparation gets both scheduled days', async () => {
    await session(1);
    const rows=await slots(1);
    assert.equal(rows.length,2);
    assert.equal(rows[0].slot_key,'2026-11-09-09:00-18:00-1');
    assert.equal(rows[0].starts_at,'09:00:00');
    assert.equal(rows[1].label,'Jour 2');
    assert.ok(rows.every(r=>r.status==='draft'));
    await enrol(10,1);
    assert.equal((await records(1)).length,2);
    assert.ok((await records(1)).every(r=>r.status==='pending'));
  });
  await t.test('draft and archived sessions do not prepare; ready transition includes existing enrolments', async () => {
    await session(2,'draft'); await enrol(20,2);
    await session(3,'archived'); await enrol(30,3);
    assert.equal((await slots(2)).length,0); assert.equal((await slots(3)).length,0);
    await db.query("update daily_sessions set status='ready' where id=$1",[id(2)]);
    assert.equal((await slots(2)).length,2); assert.equal((await records(2)).length,2);
  });
  await t.test('inactive and foreign-organisation enrolments are excluded', async () => {
    for (const [i,s] of ['abandoned','cancelled','declined','completed'].entries()) await enrol(40+i,1,s);
    await enrol(50,1,'confirmed',id(999));
    assert.equal((await records(1)).length,2);
    await db.query("update daily_session_enrolments set status='confirmed' where id=$1",[id(40)]);
    assert.equal((await records(1)).length,4);
  });
  await t.test('retries preserve signatures, custom modes and cancelled slots', async () => {
    const before=await slots(1);
    await db.query("update daily_attendance_records set status='present' where enrolment_id=$1",[id(10)]);
    await db.query("update daily_attendance_slots set status='cancelled',mode='distanciel_synchrone' where id=$1",[before[0].id]);
    await db.query("update daily_sessions set status='ready' where id=$1",[id(1)]);
    await db.query("update daily_session_enrolments set status='confirmed' where id=$1",[id(10)]);
    assert.equal((await slots(1)).length,2);
    assert.equal((await slots(1))[0].status,'cancelled');
    assert.equal((await slots(1))[0].mode,'distanciel_synchrone');
    assert.equal((await records(1)).filter(r=>r.status==='present').length,2);
    assert.equal((await records(1)).length,4);
  });
  await t.test('distance modes follow the existing manual preparation convention', async () => {
    await session(4,'ready','distanciel','synchrone'); await session(5,'ready','distanciel','asynchrone');
    assert.equal((await slots(4))[0].mode,'distanciel_synchrone');
    assert.equal((await slots(5))[0].mode,'distanciel_asynchrone');
  });
  await t.test('preparation failure rolls back the session instead of silently leaving it unprepared', async () => {
    await assert.rejects(db.query('insert into daily_sessions values($1,$2,$3,$4,null,$5)',[id(6),id(100),'ready','presentiel',JSON.stringify([{date:'2026-11-09',start:'18:00',end:'09:00'}]) ]));
    assert.equal((await db.query('select id from daily_sessions where id=$1',[id(6)])).rows.length,0);
  });
  await t.test('trigger is invoker and has no public RPC execution grant', async () => {
    const p=(await db.query("select prosecdef,has_function_privilege('anon','private.daily_prepare_initial_attendance()','execute') as anon from pg_proc where proname='daily_prepare_initial_attendance'")).rows[0];
    assert.equal(p.prosecdef,false); assert.equal(p.anon,false);
  });
});
