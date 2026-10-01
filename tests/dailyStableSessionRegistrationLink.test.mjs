import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
globalThis.fetch = () => { throw new Error('Network forbidden'); };
function compile(source, dependencies) {
  const exports = {};
  new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)((name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const source = await read('app/api/client/daily/sessions/route.ts');
const publicSource = await read('app/api/daily-registration/[token]/route.ts');
const participants = compile(await read('lib/dailySessionParticipants.ts'), {});
const editable = { id: 's1', formation_id: 'f1', status: 'ready', modality: 'presentiel', location_address: 'Salle fictive', start_date: '2060-01-01', end_date: '2060-01-01', schedule_blocks: [{ date: '2060-01-01', start: '09:00', end: '10:00' }], beneficiaries: [], individual_beneficiaries: [], companies: [], trainer_ids: [] };
function fixture(options = {}) {
  const rows = options.absent ? [] : [{ ...structuredClone(editable), organisation_id: options.foreign ? 'of-b' : 'of-a', user_id: 'u1', registration_token: 'shared-token', ...options.row }];
  const writes = [], effects = [], queries = [];
  let raced = false;
  const admin = {
    from(table) {
      assert.ok(['daily_sessions', 'daily_formations', 'daily_onboarding', 'daily_session_enrolments', 'daily_trainer_profiles'].includes(table));
      const filters = []; let operation = 'read', payload, columns;
      const execute = async () => {
        queries.push({ table, operation, filters, columns });
        if (table === 'daily_sessions' && operation === 'read' && columns === 'id,formation_id') {
          assert.deepEqual(filters, [['eq', 'id', 's1'], ['eq', 'organisation_id', 'of-a']]);
          if (options.readError) return { data: null, error: { message: 'read failed' } };
        }
        if (operation === 'update' && !raced) {
          raced = true;
          options.race?.(rows);
        }
        const pool = table === 'daily_sessions' ? rows : table === 'daily_formations' ? ['f1', 'f2'].map(id => ({ id, organisation_id: 'of-a', status: 'validated' })) : [];
        const matches = pool.filter(row => filters.every(([op, key, value]) => op === 'eq' ? row[key] === value : op === 'neq' ? row[key] !== value : op === 'in' ? value.includes(row[key]) : true));
        if (operation !== 'read') {
          assert.equal(table, 'daily_sessions');
          if (options.writeError) return { data: null, error: { message: 'write failed' } };
          if (operation === 'insert') { const row = { id: `s${rows.length + 1}`, ...payload }; rows.push(row); writes.push(payload); return { data: structuredClone(row), error: null }; }
          assert.ok(filters.some(([op, key, value]) => op === 'eq' && key === 'organisation_id' && value === 'of-a'));
          if (Object.hasOwn(payload, 'formation_id')) assert.ok(filters.some(([op, key, value]) => op === 'eq' && key === 'formation_id' && value === 'f1'));
          if (!matches.length) return { data: null, error: null };
          Object.assign(matches[0], payload); writes.push(payload);
        }
        return { data: structuredClone(matches[0] ?? null), error: null };
      };
      return {
        select(value) { columns = value; return this; },
        eq(key, value) { filters.push(['eq', key, value]); return this; },
        neq(key, value) { filters.push(['neq', key, value]); return this; },
        in(key, value) { filters.push(['in', key, value]); return this; },
        not(key, op, value) { assert.equal(op, 'in'); filters.push(['not', key, value]); return this; },
        order() { return this; }, range() { return this; },
        update(value) { operation = 'update'; payload = structuredClone(value); return this; },
        insert(value) { operation = 'insert'; payload = structuredClone(value); return this; },
        maybeSingle: execute, single: execute,
        then(resolve, reject) { return execute().then(result => ({ ...result, data: result.data ? [result.data] : [] })).then(resolve, reject); },
      };
    },
    async rpc(name, args) { assert.equal(name, 'daily_prepare_upper_tier_if_needed'); assert.deepEqual(args, { p_user_id: 'billing' }); effects.push('tier'); return { data: 0, error: null }; },
  };
  const context = { ok: true, organisationId: 'of-a', user: { id: 'u1' }, admin, assisted: true, assistance: {} };
  const handlers = compile(source, {
    'next/server': require('next/server'), '@/lib/dailySessionParticipants': participants,
    '@/lib/server/dailyOrganisationContext': {
      async getDailyOrganisationContext(req, capability, args) { assert.equal(capability, 'sessions'); assert.deepEqual(args, { allowAssistanceWrite: true }); return context; },
      async getDailyOrganisationReadContext() { return context; },
      async getDailyOrganisationBillingUserId() { effects.push('billing'); return 'billing'; },
    },
    '@/lib/server/agentAssistance': { async logAgentAssistanceAction() { effects.push('assistance'); } },
    '@/lib/server/dailyEnterprisePortalAccess': { async sendEnterprisePortalAccessForSessionCompanies() { effects.push('company'); return []; } },
  });
  const publicHandlers = compile(publicSource, {
    'next/server': require('next/server'), crypto: require('node:crypto'),
    '@/lib/server/clientNdaAccess': { getAdminSupabase: () => admin },
    '@/lib/server/dailyRegistrationEmails': { sendDailyRegistrationConfirmation() { assert.fail('Email forbidden'); } },
    '@/lib/dailyBeneficiarySiret': {}, '@/lib/dailyRegistration': {},
  });
  return { rows, writes, effects, queries,
    async call(method = 'PATCH', body = {}) { return handlers[method](new Request('https://fixture.test/sessions', { method, ...(method === 'GET' ? {} : { body: JSON.stringify({ ...editable, ...body }) }) })); },
    async resolve() { return publicHandlers.GET(new Request('https://fixture.test/registration/shared-token'), { params: Promise.resolve({ token: 'shared-token' }) }); },
  };
}
test('GET → éditions ordinaires → résolution du même lien, sans duplication', async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) {
    const read = await (await f.call('GET')).json();
    assert.equal(read.sessions.length, 1);
    assert.equal((await f.resolve()).status, 200);
    assert.equal((await f.call('PATCH', { ...read.sessions[0], internal_reference: `edit-${i}`, registration_token: 'browser-token' })).status, 200);
    assert.equal(Object.hasOwn(f.writes.at(-1), 'registration_token'), false);
    assert.equal(f.rows[0].registration_token, 'shared-token');
  }
  assert.equal((await f.resolve()).status, 200);
  assert.equal(f.rows.length, 1);
  assert.equal(f.effects.length, 12);
});
for (const concurrent of [false, true]) test(`token nul et navigateur ignoré, préparation concurrente=${concurrent}`, async () => {
  const f = fixture({ row: { registration_token: null }, race: concurrent ? rows => { rows[0].registration_token = 'concurrent-token'; } : undefined });
  assert.equal((await f.call('PATCH', { registration_token: 'browser-token' })).status, 200);
  assert.equal(f.rows[0].registration_token, concurrent ? 'concurrent-token' : null);
  assert.equal(Object.hasOwn(f.writes[0], 'registration_token'), false);
});
for (const [method, body] of [['PATCH', { formation_id: 'f2' }], ['PATCH', { status: 'archived' }], ['DELETE', {}]]) test(`${method} ${JSON.stringify(body)} invalide le lien`, async () => {
  const f = fixture();
  assert.equal((await f.call(method, body)).status, 200);
  assert.equal(f.rows[0].registration_token, null);
  assert.equal((await f.resolve()).status, 404);
});
for (const duplicate of [false, true]) test(`POST token nul, duplication=${duplicate}`, async () => {
  const f = fixture();
  assert.equal((await f.call('POST', { ...(duplicate ? { action: 'duplicate' } : {}), registration_token: 'browser-token' })).status, 200);
  assert.equal(f.rows[1].registration_token, null);
  assert.equal(f.rows[0].registration_token, 'shared-token');
});
for (const [options, status] of [[{ absent: true }, 404], [{ foreign: true }, 404], [{ readError: true }, 500], [{ writeError: true }, 500], [{ race: rows => { rows[0].formation_id = 'f2'; rows[0].registration_token = 'new-link'; } }, 409], [{ race: rows => { rows.length = 0; } }, 409]]) test(`échec sans effet secondaire: ${JSON.stringify(options)} / ${status}`, async () => {
  const f = fixture(options);
  assert.equal((await f.call()).status, status);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.effects, []);
  if (options.absent || options.foreign || options.readError) assert.ok(f.queries.every(q => q.operation === 'read'));
  if (f.rows[0]?.formation_id === 'f2') assert.equal(f.rows[0].registration_token, 'new-link');
});
test('validations formation, formateur et statut restent bloquantes', async () => {
  for (const [body, status] of [[{ formation_id: 'foreign' }, 404], [{ trainer_ids: ['foreign'] }, 400], [{ status: 'invalid' }, 400]]) {
    const f = fixture();
    assert.equal((await f.call('PATCH', body)).status, status);
    assert.deepEqual(f.writes, []); assert.deepEqual(f.effects, []);
  }
});
