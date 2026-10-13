import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const sql = await readFile(new URL("../supabase/migrations/20261013115000_promote_analyzed_registration_for_of.sql", import.meta.url), "utf8");

test("une analyse terminée déclenche la décision OF sans accepter automatiquement", async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.daily_formation_registration_requests (
      id integer primary key, decision_status text not null default 'pending',
      agent_analysis_completed_at timestamptz, submitted_at timestamptz, status text
    );
    insert into public.daily_formation_registration_requests values
      (1,'pending',now(),now(),'submitted'),
      (2,'pending',null,now(),'submitted'),
      (3,'accepted',now(),now(),'submitted'),
      (4,'pending',now(),now(),'archived');
  `);
  await db.exec(sql);
  const rows = (await db.query("select id,decision_status from public.daily_formation_registration_requests order by id")).rows;
  assert.deepEqual(rows.map(x=>x.decision_status),["ready_for_of","pending","accepted","pending"]);
  await db.query("update public.daily_formation_registration_requests set agent_analysis_completed_at=now() where id=2");
  assert.equal((await db.query("select decision_status from public.daily_formation_registration_requests where id=2")).rows[0].decision_status,"ready_for_of");
  await db.query("insert into public.daily_formation_registration_requests values (5,'pending',now(),now(),'submitted')");
  assert.equal((await db.query("select decision_status from public.daily_formation_registration_requests where id=5")).rows[0].decision_status,"ready_for_of");
});
