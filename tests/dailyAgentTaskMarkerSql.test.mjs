import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const sql = await readFile(new URL('../supabase/migrations/20261004081728_daily_agent_task_email_marker.sql', import.meta.url), 'utf8');
test('A6 marker migration adds a nullable timestamp without inventing historical deliveries', async () => {
  const db = new PGlite(); try {
    await db.exec("create table notifications(id integer primary key, title text); insert into notifications values (1,'Historique');"); await db.exec(sql);
    assert.deepEqual((await db.query('select * from notifications')).rows, [{ id: 1, title: 'Historique', email_sent_at: null }]);
    const column = (await db.query("select data_type,is_nullable from information_schema.columns where table_name='notifications' and column_name='email_sent_at'")).rows[0]; assert.equal(column.data_type, 'timestamp with time zone'); assert.equal(column.is_nullable, 'YES');
  } finally { await db.close(); }
});
test('A6 marker migration can be replayed without changing a proven historical timestamp', async () => {
  const db = new PGlite(); try {
    await db.exec("create table notifications(id integer primary key,email_sent_at timestamptz); insert into notifications values(1,'2026-09-01T12:00:00Z');");
    const before = (await db.query('select * from notifications')).rows; await db.exec(sql); await db.exec(sql); assert.deepEqual((await db.query('select * from notifications')).rows, before);
  } finally { await db.close(); }
});
