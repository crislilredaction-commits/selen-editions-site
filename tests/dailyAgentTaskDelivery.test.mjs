import assert from 'node:assert/strict';
import test from 'node:test';
import { agentTaskHarness, uuid, at } from './helpers/dailyAgentTaskHarness.mjs';

test('A6 refuses absent/wrong authorization and an unconfigured secret before any database work', async () => {
  for (const [opts, auth] of [[{}, ''], [{}, 'Bearer wrong'], [{ noSecret: true }, 'Bearer cron-test-only']]) {
    const h = agentTaskHarness(opts); assert.equal((await h.run(auth)).status, 401); assert.equal(h.queries.length, 0); assert.equal(h.sends.length, 0);
  }
});
test('A6 sends to the current active assigned agent, with exact client and direct Studio link', async () => {
  const h = agentTaskHarness(); const r = await h.run(); assert.equal(r.status, 200); assert.equal(r.body.processed, 1);
  assert.equal(h.sends[0].message.to, h.agent.email); assert.match(h.sends[0].message.text, /Alpha Formation/); assert.match(h.sends[0].message.text, /https:\/\/studio\.selen-editions\.fr\/agent\/daily\/organisations\//);
  const proof = h.db.daily_communications[0]; assert.equal(proof.provider_message_id, 'provider-1'); assert.equal(proof.status, 'sent'); assert.equal(proof.organisation_id, h.org.id); assert.equal(h.notification.email_sent_at, proof.sent_at);
});
for (const kind of ['unassigned', 'inactive', 'blank-email', 'invalid-email', 'stale-target']) test(`A6 admin fallback: ${kind}`, async () => {
  const h = agentTaskHarness();
  if (kind === 'unassigned') h.db.daily_organisation_assignments = [];
  if (kind === 'inactive') h.agent.is_active = false;
  if (kind === 'blank-email') h.agent.email = '  ';
  if (kind === 'invalid-email') h.agent.email = 'broken';
  if (kind === 'stale-target') h.db.daily_organisation_assignments[0].agent_profile_id = uuid(999);
  assert.equal((await h.run()).status, 200); assert.equal(h.sends.length, 1); assert.equal(h.sends[0].message.to, 'admin@example.test'); assert.equal(h.notification.target_role, 'admin'); assert.equal(h.notification.target_agent_profile_id, null);
});
test('A6 ignores stale stored target in favor of the canonical current assignment', async () => {
  const h = agentTaskHarness(); h.notification.target_agent_profile_id = uuid(999); assert.equal((await h.run()).status, 200); assert.equal(h.sends[0].message.to, h.agent.email);
});
test('A6 sends to each distinct active admin individually without revealing another address', async () => {
  const h = agentTaskHarness(); h.db.daily_organisation_assignments = []; h.db.selen_admin_users.push({ email: 'second@example.test', role: 'admin', is_active: true }, { email: 'inactive@example.test', role: 'admin', is_active: false }, { email: 'support@example.test', role: 'agent', is_active: true });
  assert.equal((await h.run()).status, 200); assert.equal(h.sends.length, 2); assert.deepEqual(h.sends.map(s => s.message.to).sort(), ['admin@example.test', 'second@example.test']); assert.equal(h.db.daily_communications.length, 2);
});
test('A6 repeated run reuses provider evidence without sending again', async () => {
  const h = agentTaskHarness(); await h.run(); await h.run(); assert.equal(h.sends.length, 1); assert.equal(h.db.daily_communications.length, 1);
});
test('A6 simultaneous workers reserve one delivery before calling the provider', async () => {
  const h = agentTaskHarness({ onSend: () => new Promise(resolve => setImmediate(resolve)) });
  const results = await Promise.all([h.run(), h.run()]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 207]); assert.equal(h.sends.length, 1);
  assert.equal(results.find(r => r.status === 207).body.pending, 1); await h.run(); assert.equal(h.sends.length, 1);
});
for (const mode of ['throw', 'ambiguous', 'missing-id']) test(`A6 uncertain provider outcome ${mode} is retained without an automatic resend`, async () => {
  const h = agentTaskHarness({ transport: mode }); assert.equal((await h.run()).body.pending, 1); assert.equal(h.notification.email_sent_at, null); assert.equal(h.db.daily_communications[0].status, 'queued'); h.setTransport('success'); await h.run(); assert.equal(h.sends.length, 1);
});
test('A6 a definitive provider rejection permits a safe retry on the same operation key', async () => {
  const h = agentTaskHarness({ transport: 'reject' }); assert.equal((await h.run()).body.failed, 1); const key = h.sends[0].config.idempotencyKey; h.setTransport('success'); assert.equal((await h.run()).status, 200); assert.equal(h.sends[1].config.idempotencyKey, key); assert.equal(h.db.daily_communications.length, 1);
});
test('A6 failed provider-proof write preserves the durable claim instead of resending', async () => {
  const h = agentTaskHarness({ failMutation: (table, _action, payload) => table === 'daily_communications' && payload?.provider_message_id });
  assert.equal((await h.run()).body.pending, 1); await h.run(); assert.equal(h.sends.length, 1); assert.equal(h.notification.email_sent_at, null);
});
test('A6 failed notification marker is repaired from the proof without a second email', async () => {
  let fail = true; const h = agentTaskHarness({ failMutation: (table, _action, payload) => fail && table === 'notifications' && payload?.email_sent_at });
  assert.equal((await h.run()).body.pending, 1); fail = false; assert.equal((await h.run()).status, 200); assert.equal(h.sends.length, 1); assert.ok(h.notification.email_sent_at);
});
test('A6 a zero-row marker update never reports confirmed processing', async () => {
  const h = agentTaskHarness({ zeroUpdate: (table, payload) => table === 'notifications' && payload?.email_sent_at }); assert.equal((await h.run()).body.pending, 1); assert.equal(h.notification.email_sent_at, null);
});
test('A6 a notification closed or changed before routing cannot trigger the provider', async () => {
  const h = agentTaskHarness({ zeroUpdate: (table, payload) => table === 'notifications' && payload?.target_role });
  assert.equal((await h.run()).body.pending, 1); assert.equal(h.sends.length, 0); assert.equal(h.db.daily_communications.length, 0);
});
test('A6 a new canonical signal creates a new event, while ordinary retries remain deduplicated', async () => {
  const h = agentTaskHarness(); await h.run(); h.item.signaled_at = '2099-01-01T00:00:00.000Z'; await h.run(); await h.run(); assert.equal(h.sends.length, 2); assert.notEqual(h.sends[0].config.idempotencyKey, h.sends[1].config.idempotencyKey);
});
test('A6 reassignment notifies the new recipient only once', async () => {
  const h = agentTaskHarness(); await h.run(); h.db.daily_organisation_assignments[0].agent_profile_id = h.adminProfile.id; await h.run(); await h.run(); assert.deepEqual(h.sends.map(s => s.message.to), [h.agent.email, 'admin@example.test']);
});
test('A6 timestamp-only historical delivery is not silently replayed or presented as new proof', async () => {
  const h = agentTaskHarness(); h.notification.email_sent_at = '2026-10-04T10:00:00.000Z'; const r = await h.run(); assert.equal(r.body.skipped, 1); assert.equal(r.status, 207); assert.equal(h.sends.length, 0); assert.equal(h.db.daily_communications.length, 0);
});
test('A6 missing recipient remains visible as unresolved', async () => {
  const h = agentTaskHarness(); h.agent.email = ''; h.adminProfile.is_active = false; h.db.selen_admin_users = []; const r = await h.run(); assert.equal(r.status, 207); assert.equal(r.body.skipped, 1); assert.equal(h.notification.dismissed_at, null); assert.equal(h.sends.length, 0);
});
test('A6 more than 100 unresolved older notifications cannot starve a later routable task', async () => {
  const h = agentTaskHarness(); h.notification.id = uuid(1000);
  h.db.notifications.unshift(...Array.from({ length: 120 }, (_, i) => ({ ...h.notification, id: uuid(i + 50), source_key: `daily_checklist:${uuid(i + 5000)}` })));
  const r = await h.run(); assert.equal(r.body.due, 121); assert.equal(r.body.processed, 1); assert.equal(h.sends.length, 1); assert.ok(h.queries.some(q => q.range?.[0] === 100));
});
test('A6 programme review is visible and mailed even before a session exists, without duplicate task', async () => {
  const h = agentTaskHarness(); h.db.notifications = []; h.db.daily_organisation_checklist_items = [];
  h.db.daily_formations.push({ id: uuid(20), organisation_id: h.org.id, title: 'Programme importé', status: 'review', creation_mode: 'program_import', detailed_program_document_url: 'private-source', agent_review_signaled_at: at, created_at: at, updated_at: at });
  assert.equal((await h.run()).status, 200); await h.run(); assert.equal(h.sends.length, 1); assert.equal(h.db.notifications.length, 1); assert.equal(h.db.notifications[0].link_path, `/agent/daily/formations/${uuid(20)}`); assert.match(h.sends[0].message.text, /Programme importé/);
  h.db.daily_formations[0].status = 'validated'; await h.run(); assert.ok(h.db.notifications[0].dismissed_at); assert.equal(h.sends.length, 1);
});
test('A6 imported draft is actionable but an ordinary empty draft is not', async () => {
  const h = agentTaskHarness(); h.db.notifications = []; h.db.daily_organisation_checklist_items = [];
  h.db.daily_formations.push({ id: uuid(21), organisation_id: h.org.id, title: 'Original transmis', status: 'draft', creation_mode: 'program_import', detailed_program_document_url: 'private-source', created_at: at, updated_at: at }, { id: uuid(22), organisation_id: h.org.id, title: 'Brouillon', status: 'draft', creation_mode: 'selen_form', created_at: at });
  await h.run(); assert.equal(h.sends.length, 1); assert.equal(h.db.notifications[0].title, 'Programme importé à compléter');
});
test('A6 completed tasks and future session phases are not mailed', async () => {
  const h = agentTaskHarness(); h.item.status = 'done';
  const sessionItem = { ...h.item, id: uuid(30), session_id: uuid(31), status: 'todo', phaseAvailable: false }; h.db.daily_session_checklist_items.push(sessionItem); h.db.notifications.push({ ...h.notification, id: uuid(32), source_key: `daily_session_checklist:${sessionItem.id}`, source_kind: 'daily_session_checklist' });
  await h.run(); assert.equal(h.sends.length, 0); assert.ok(h.rpcs.some(r => r.name === 'daily_sync_session_checklist_notification'));
});
test('A6 session tasks preserve the exact session and direct link', async () => {
  const h = agentTaskHarness(); h.db.daily_organisation_checklist_items = [];
  const sessionItem = { ...h.item, session_id: uuid(31), status: 'todo' }; h.db.daily_session_checklist_items.push(sessionItem); h.notification.source_key = `daily_session_checklist:${sessionItem.id}`; h.notification.source_kind = 'daily_session_checklist'; h.notification.link_path = `/agent/daily/session-dossiers/${sessionItem.session_id}`;
  await h.run(); assert.equal(h.db.daily_communications[0].session_id, sessionItem.session_id); assert.match(h.sends[0].message.text, new RegExp(sessionItem.session_id));
});
test('A6 inactive Daily subscriptions and archived/foreign organisations never acquire a delivery', async () => {
  const h = agentTaskHarness(); h.db.daily_subscriptions[0].status = 'cancelled'; assert.equal((await h.run()).body.due, 0); assert.equal(h.sends.length, 0);
  h.db.daily_subscriptions[0].status = 'active'; h.org.status = 'archived'; await h.run(); assert.equal(h.sends.length, 0);
  h.org.status = 'active'; h.item.organisation_id = uuid(900); await h.run(); assert.equal(h.sends.length, 0);
});
test('A6 exact subject, client text and HTML are escaped, and external task links are refused', async () => {
  const h = agentTaskHarness(); const m = h.load('lib/server/dailyAgentTaskEmails.ts'); const prepared = m.prepareDailyAgentTaskEmail({ title: '<script>x</script>', content: '<img src=x>', recipientName: '<b>A</b>', organisationName: 'A&B', linkPath: '/agent/daily/formations/one' });
  assert.match(prepared.html, /&lt;script&gt;/); assert.doesNotMatch(prepared.html, /<script>|<img/); assert.match(prepared.html, /A&amp;B/);
  for (const path of ['https://evil.example/agent/daily/x', '//evil.example/agent/daily/x', '/client/private', 'javascript:alert(1)']) assert.throws(() => m.dailyAgentTaskUrl(path));
});
for (const table of ['daily_subscriptions', 'organisations', 'agent_profiles', 'selen_admin_users', 'daily_organisation_assignments', 'daily_organisation_checklist_items', 'daily_session_checklist_items', 'daily_formations', 'notifications']) test(`A6 ${table} read failure cannot send or falsely confirm`, async () => {
  const h = agentTaskHarness({ failRead: table }); assert.equal((await h.run()).status, 500); assert.equal(h.sends.length, 0);
});
test('A6 auth lookup and canonical synchronization failures are closed', async () => {
  for (const opts of [{ authError: true }, { rpcError: true }]) { const h = agentTaskHarness(opts); assert.equal((await h.run()).status, 500); assert.equal(h.sends.length, 0); }
});
test('A6 POST shares the same guarded worker', async () => { const h = agentTaskHarness(); assert.equal((await h.run('Bearer cron-test-only', 'POST')).status, 200); assert.equal(h.sends.length, 1); });
