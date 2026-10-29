import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadTypeScript } from './loadTypeScript.mjs';

export const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const at = '2026-10-04T09:00:00.000Z';
export function agentTaskHarness(options = {}) {
  const org = { id: uuid(1), name: 'OF Alpha', legal_name: 'Alpha Formation', email: 'owner@example.test', status: 'active' };
  const agent = { id: uuid(2), user_id: uuid(3), email: 'agent@example.test', first_name: 'Alice', last_name: 'Agent', role: 'agent', is_active: true };
  const adminProfile = { id: uuid(4), user_id: uuid(5), email: 'admin@example.test', first_name: 'Ada', last_name: 'Admin', role: 'admin', is_active: true };
  const item = { id: uuid(6), organisation_id: org.id, signaled_at: at, status: 'to_review', label: 'Programme transmis', phase: 'pre', responsibility: 'selen' };
  const notification = { id: uuid(7), source_key: `daily_checklist:${item.id}`, source_kind: 'daily_checklist', type: 'daily_checklist', title: 'À contrôler', content: 'Programme A', organisation_name: org.name, target_agent_profile_id: agent.id, target_role: 'agent', link_path: `/agent/daily/organisations/${org.id}?tab=checklist`, created_at: at, email_sent_at: null, dismissed_at: null };
  const db = { daily_subscriptions: [{ user_id: uuid(10), status: 'active' }], organisations: [org], agent_profiles: [agent, adminProfile], selen_admin_users: [{ email: ' ADMIN@example.test ', role: 'admin', is_active: true }], daily_organisation_assignments: [{ organisation_id: org.id, agent_profile_id: agent.id }], daily_organisation_checklist_items: [item], daily_session_checklist_items: [], daily_formations: [], notifications: [notification], daily_communications: [] };
  const sends = [], writes = [], queries = [], rpcs = [];
  let transport = options.transport ?? 'success';
  const admin = { auth: { admin: { async getUserById(id) { assert.equal(id, uuid(10)); return options.authError ? { data: { user: null }, error: { message: 'auth' } } : { data: { user: { email: 'OWNER@example.test' } }, error: null }; } } },
    from(table) {
      assert.ok(Object.hasOwn(db, table), `Unexpected table ${table}`);
      let filters = [], limit, range, order, one = false, mutation, payload, columns = '*';
      const project = row => row == null ? null : structuredClone(columns === '*' ? row : Object.fromEntries(columns.split(',').filter(k => Object.hasOwn(row, k)).map(k => [k, row[k]])));
      const q = {
        select(c) { columns = c; return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; }, neq(k, v) { filters.push(r => r[k] !== v); return q; },
        in(k, v) { filters.push(r => v.includes(r[k])); return q; }, is(k, v) { filters.push(r => (r[k] ?? null) === v); return q; },
        not(k, op, v) { assert.equal(op, 'is'); filters.push(r => (r[k] ?? null) !== v); return q; },
        contains(k, v) { filters.push(r => Object.entries(v).every(([a, b]) => r[k]?.[a] === b)); return q; },
        order(k, opts) { order = [k, opts?.ascending !== false]; return q; }, limit(n) { limit = n; return q; }, range(a, b) { range = [a, b]; return q; },
        single() { one = true; return q; }, maybeSingle() { one = true; return q; },
        insert(v) { assert.equal(table, 'daily_communications'); mutation = 'insert'; payload = v; return q; },
        update(v) { assert.ok(['notifications', 'daily_communications'].includes(table)); mutation = 'update'; payload = v; return q; },
        upsert(v, opts) { assert.equal(table, 'notifications'); assert.equal(opts.onConflict, 'id'); mutation = 'upsert'; payload = v; return q; },
        then(resolve, reject) { return Promise.resolve().then(() => {
          queries.push({ table, mutation, columns, range });
          if (options.failRead === table && !mutation || options.failMutation?.(table, mutation, payload)) return { data: null, error: { code: 'mock_error', message: 'unavailable' } };
          if (mutation === 'insert' || mutation === 'upsert') {
            const prior = db[table].find(row => row.id === payload.id);
            if (prior && mutation === 'insert') return { data: null, error: { code: '23505' } };
            if (prior) Object.assign(prior, structuredClone(payload));
            else db[table].push({ ...structuredClone(payload), ...(table === 'notifications' ? { email_sent_at: null } : { created_at: at, sent_at: null, provider_message_id: null }) });
            writes.push({ table, mutation, payload: structuredClone(payload) });
            const row = prior ?? db[table].at(-1);
            return { data: one ? project(row) : [project(row)], error: null };
          }
          let rows = db[table].filter(row => filters.every(f => f(row)));
          if (mutation === 'update') {
            if (options.zeroUpdate?.(table, payload)) rows = [];
            rows.forEach(row => Object.assign(row, structuredClone(payload)));
            if (rows.length) writes.push({ table, mutation, payload: structuredClone(payload) });
          }
          if (order) rows.sort((a, b) => String(a[order[0]]).localeCompare(String(b[order[0]])) * (order[1] ? 1 : -1));
          if (range) rows = rows.slice(range[0], range[1] + 1);
          if (limit) rows = rows.slice(0, limit);
          return { data: one ? project(rows[0]) : rows.map(project), error: null };
        }).then(resolve, reject); },
      }; return q;
    },
    async rpc(name, params) {
      assert.ok(['daily_sync_checklist_notification', 'daily_sync_session_checklist_notification'].includes(name));
      rpcs.push({ name, params });
      if (options.rpcError) return { error: { message: 'rpc failure' } };
      const session = name === 'daily_sync_session_checklist_notification';
      const source = db[session ? 'daily_session_checklist_items' : 'daily_organisation_checklist_items'].find(row => row.id === params.p_item_id);
      const kind = session ? 'daily_session_checklist' : 'daily_checklist';
      const n = db.notifications.find(row => row.source_key === `${kind}:${source.id}`);
      // Model the existing RPC contract, including phase-gated dismissal.
      if (n && (!['to_review', 'blocked', ...(session ? ['todo'] : [])].includes(source.status) || source.phaseAvailable === false)) n.dismissed_at = at;
      return { error: null };
    },
  };
  class Resend { constructor(key) { assert.equal(key, 'test-only'); this.emails = { send: async (message, config) => {
    sends.push(structuredClone({ message, config }));
    if (options.onSend) await options.onSend();
    if (transport === 'throw') throw Error('network outcome unknown');
    if (transport === 'reject') return { data: null, error: { name: 'validation_error' } };
    if (transport === 'ambiguous') return { data: null, error: { name: 'application_error' } };
    return { data: transport === 'missing-id' ? {} : { id: `provider-${sends.length}` }, error: null };
  } }; } }
  const modules = {};
  const paths = ['lib/server/dailyAgentTaskScope.ts', 'lib/server/dailyAgentTaskEmails.ts', 'lib/server/dailyLearnerEmailDelivery.ts', 'app/api/cron/daily-agent-task-notifications/route.ts'];
  const env = { RESEND_API_KEY: 'test-only', CRON_SECRET: options.noSecret ? '' : 'cron-test-only', DAILY_AUTOMATION_SECRET: '' };
  function load(path) {
    if (modules[path]) return modules[path];
    assert.ok(paths.includes(path));
    const deps = { 'node:crypto': crypto, 'resend': { Resend }, 'next/server': { NextResponse: { json: Response.json } }, '@/lib/server/clientNdaAccess': { getAdminSupabase: () => admin } };
    for (const p of paths.filter(p => p.startsWith('lib/') && p !== path)) Object.defineProperty(deps, '@/' + p.slice(0, -3), { get: () => load(p) });
    modules[path] = loadTypeScript(path, deps, { process: { env }, Date, Response, Request, URL, console: { error() {} }, fetch() { throw Error('Real network forbidden'); } });
    return modules[path];
  }
  const run = async (auth = 'Bearer cron-test-only', method = 'GET') => {
    const response = await load(paths.at(-1))[method](new Request('https://site.example.test/api/cron/daily-agent-task-notifications', { method, headers: auth ? { authorization: auth } : {} }));
    return { status: response.status, body: await response.json() };
  };
  return { db, org, agent, adminProfile, item, notification, admin, sends, writes, queries, rpcs, load, run, env, setTransport(value) { transport = value; } };
}
