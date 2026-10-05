import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const schema = await fs.readFile(new URL('./fixtures/dailyOwnPositioningSchema.sql', import.meta.url), 'utf8');
const legacy = await fs.readFile(new URL('../supabase/migrations/20260829170817_daily_formation_version_workflow.sql', import.meta.url), 'utf8');
const guard = await fs.readFile(new URL('../supabase/migrations/20261005061254_daily_formation_review_validation_guard.sql', import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FORM = id(1), ORG = id(2), USER = id(3);

test('Studio programme validation uses the saved PostgreSQL revision and commits its task atomically', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(schema);
  await db.exec(legacy);
  await db.exec(`begin;${guard}commit;`);
  await db.exec(`begin;${guard}commit;`); // Reapplying additive DDL changes no data.
  await db.exec(`
    create function public.qa_formation_updated_at() returns trigger language plpgsql as $$
    begin new.updated_at := clock_timestamp(); return new; end $$;
    create trigger qa_formation_updated_at before update on public.daily_formations
      for each row execute function public.qa_formation_updated_at();
    grant select, update on public.daily_formations to service_role;
  `);
  async function seed(status = 'draft') {
    await db.exec('truncate public.daily_formations');
    await db.query(`insert into public.daily_formations (
      id, organisation_id, user_id, title, global_objective, target_audience,
      prerequisites, duration_hours, duration_days, modality, modality_details,
      access_delays, registration_methods, price, detailed_program, accessibility,
      pedagogical_resources, evaluation_methods, contact_phone, contact_email,
      status, public_registration_token
    ) values ($1,$2,$3,'Programme relu','Objectif','Public','Aucun',7,1,'presentiel',
      'Salle','Délai','Candidature','100','Contenu détaillé','Contact','Support',
      'Évaluation','0102030405','of@example.test',$4,'stable-existing-token')`, [FORM, ORG, USER, status]);
    // This is the actual row returned by the save, including the database trigger.
    return (await db.query("update public.daily_formations set title='Programme sauvegardé', updated_at='2000-01-01' where id=$1 returning *, updated_at::text as saved_revision", [FORM])).rows[0];
  }
  async function current() { return (await db.query('select *, updated_at::text as saved_revision from public.daily_formations where id=$1', [FORM])).rows[0]; }
  async function validate(row, overrides = {}) {
    const args = { formation: FORM, organisation: ORG, revision: row.saved_revision, status: row.status, ...overrides };
    return (await db.query('select * from public.daily_validate_formation_review($1,$2,$3,$4,$5)',
      [args.formation, args.organisation, args.revision, args.status, 'Programme vérifié et validé.'])).rows[0];
  }
  for (const status of ['draft', 'review', 'correction_requested']) await t.test(`${status}: same identity, public link and follow-up task`, async () => {
    const saved = await seed(status);
    assert.notEqual(new Date(saved.updated_at).getUTCFullYear(), 2000);
    await db.exec('set role service_role');
    let result;
    try { result = await validate(saved); } finally { await db.exec('reset role'); }
    assert.equal(result.id, FORM); assert.equal(result.organisation_id, ORG);
    assert.equal(result.status, 'validated'); assert.equal(result.spontaneous_registration_task_status, 'to_attach');
    assert.equal(result.public_registration_token, 'stable-existing-token');
    assert.equal(result.validation_note, 'Programme vérifié et validé.');
    assert.equal((await db.query('select count(*)::int n from public.daily_formations')).rows[0].n, 1);
    const beforeRetry = await current();
    await assert.rejects(validate(saved), error => error.code === 'P0001');
    assert.deepEqual(await current(), beforeRetry);
  });
  for (const [name, change, overrides] of [
    ['new content since save', "title='Contenu non relu'", {}],
    ['archived since save', "status='archived'", {}],
    ['moved to another OF', `organisation_id='${id(99)}'`, {}],
    ['foreign OF argument', null, { organisation: id(99) }],
    ['missing revision', null, { revision: null }],
    ['missing status', null, { status: null }],
    ['wrong status', null, { status: 'review' }],
    ['unknown programme', null, { formation: id(99) }],
    ['guessed client timestamp', null, { revision: '2000-01-01T00:00:00Z' }],
  ]) await t.test(`${name}: rejection preserves current data and creates no task`, async () => {
    const saved = await seed();
    if (change) await db.query(`update public.daily_formations set ${change} where id=$1`, [FORM]);
    const before = await current();
    await assert.rejects(validate(saved, overrides), error => error.code === 'P0001');
    assert.deepEqual(await current(), before); assert.equal(before.spontaneous_registration_task_status, 'none');
  });
  await t.test('task write failure rolls back validation and the public-link transition', async () => {
    const saved = await seed();
    await db.exec(`create function public.qa_reject_task() returns trigger language plpgsql as $$
      begin if new.spontaneous_registration_task_status='to_attach' then raise exception 'task_write_failed'; end if; return new; end $$;
      create trigger qa_reject_task before update on public.daily_formations for each row execute function public.qa_reject_task();`);
    try {
      await assert.rejects(validate(saved), /task_write_failed/);
      assert.deepEqual(await current(), saved);
    } finally { await db.exec('drop trigger qa_reject_task on public.daily_formations'); }
  });
  await t.test('validated and archived programmes cannot be validated again', async () => {
    for (const status of ['validated', 'archived']) {
      const saved = await seed(status); await assert.rejects(validate(saved), error => error.code === 'P0001');
      assert.deepEqual(await current(), saved);
    }
  });
  await t.test('service role only; invoker security and no new public RPC access', async () => {
    const fn = (await db.query(`select prosecdef,
      has_function_privilege('anon',oid,'execute') anon,
      has_function_privilege('authenticated',oid,'execute') authenticated,
      has_function_privilege('service_role',oid,'execute') service
      from pg_proc where oid='public.daily_validate_formation_review(uuid,uuid,timestamptz,text,text)'::regprocedure`)).rows[0];
    assert.deepEqual(fn, { prosecdef: false, anon: false, authenticated: false, service: true });
    const saved = await seed();
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try { await assert.rejects(validate(saved), /permission denied/); } finally { await db.exec('reset role'); }
      assert.deepEqual(await current(), saved);
    }
  });
});
