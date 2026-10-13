import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from './helpers/loadTypeScript.mjs';

function fixture({
  assisted = false,
  unassignedSession = false,
  foreignOrg = false,
  slotCancelled = false,
  alreadySigned = false,
} = {}) {
  const orgId = foreignOrg ? 'org-foreign' : 'org-1';
  const trainerId = 'trainer-1';
  const userId = 'user-1';
  const sessionId = 'session-1';
  const slotId = 'slot-1';

  const session = {
    id: sessionId,
    organisation_id: 'org-1',
    formation_id: 'formation-1',
    internal_reference: 'SESH-101',
    trainer_ids: unassignedSession ? ['trainer-other'] : ['trainer-1'],
    daily_formations: { id: 'formation-1', title: 'Formation Express' },
  };

  const slot = {
    id: slotId,
    organisation_id: 'org-1',
    session_id: sessionId,
    slot_date: '2026-10-15',
    starts_at: '09:00',
    ends_at: '12:00',
    label: 'Matin',
    status: slotCancelled ? 'cancelled' : 'open',
  };

  const documents = alreadySigned ? [{
    id: 'doc-existing-sig',
    organisation_id: 'org-1',
    session_id: sessionId,
    document_type: 'trainer_signature_evidence',
    is_current: true,
    status: 'active',
    logical_name: 'Émargement formateur — Clémentine',
    metadata: {
      slot_id: slotId,
      trainer_profile_id: trainerId,
      trainer_name: 'Clémentine',
      signed_at: '2026-10-15T09:05:00Z',
    },
  }] : [];

  const rows = {
    daily_sessions: [session],
    daily_attendance_slots: [slot],
    daily_attendance_records: [],
    daily_session_enrolments: [],
    daily_documents: [...documents],
  };

  const admin = {
    from(table) {
      assert.ok(Object.hasOwn(rows, table), `Unexpected table ${table}`);
      const filters = [];
      let single = false;
      const query = {
        select() { return query; },
        eq(k, v) { filters.push((row) => row[k] === v); return query; },
        neq(k, v) { filters.push((row) => row[k] !== v); return query; },
        in(k, v) { filters.push((row) => v.includes(row[k])); return query; },
        not(k, op, value) { filters.push((row) => row[k] !== value); return query; },
        filter(field, op, value) {
          if (op === 'eq' && field === 'metadata->>slot_id') {
            filters.push((row) => row.metadata?.slot_id === value);
          }
          if (op === 'eq' && field === 'metadata->>trainer_profile_id') {
            filters.push((row) => row.metadata?.trainer_profile_id === value);
          }
          return query;
        },
        order() { return query; },
        maybeSingle() { single = true; return query; },
        single() { single = true; return query; },
        insert(data) {
          const inserted = { id: data.id || 'doc-new', ...data };
          rows[table].push(inserted);
          const res = {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: inserted, error: null });
                },
              };
            },
            then(resolve, reject) {
              return Promise.resolve({ data: inserted, error: null }).then(resolve, reject);
            },
          };
          return res;
        },
        then(resolve, reject) {
          let data = rows[table].filter((row) => filters.every((p) => p(row)));
          return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };

  const workspaceContext = {
    getDailyTrainerWorkspaceContext: async () => ({
      ok: true,
      admin,
      user: { id: userId, email: 'clementine@example.com' },
      orgId,
      trainerId,
      trainerName: 'Clémentine',
      assisted,
    }),
    getAssignedDailyTrainerSession: async (ctx, sid) => {
      const s = rows.daily_sessions.find((x) => x.id === sid && x.organisation_id === ctx.orgId);
      return s && s.trainer_ids.includes(ctx.trainerId) ? s : null;
    },
  };

  const route = loadTypeScript('app/api/client/daily/trainer-session-workspace/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/server/dailyTrainerWorkspaceContext': workspaceContext,
    '@/lib/server/dailyEndEvaluationLifecycle': {
      refreshDailyEndEvaluationsChecklist: async () => {},
      tryEnsureDailyPosttrainingDocuments: async () => {},
    },
    '@/lib/server/dailyAttendanceChecklist': {
      refreshDailyAttendanceChecklist: async () => {},
    },
    '@/lib/server/dailyEndEvaluations': {
      activeDailyEnrolment: () => true,
    },
  }, { crypto });

  return { rows, route };
}

test('assigned authenticated trainer can sign their presence on open slot', async () => {
  const f = fixture();
  const body = new FormData();
  body.set('session_id', 'session-1');
  body.set('kind', 'trainer_signature');
  body.set('slot_id', 'slot-1');

  const request = new Request('https://site.test/api/client/daily/trainer-session-workspace', {
    method: 'POST',
    body,
  });

  const response = await f.route.POST(request);
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.ok, true);
  assert.ok(json.signature_id);

  const doc = f.rows.daily_documents.find((d) => d.id === json.signature_id);
  assert.ok(doc);
  assert.equal(doc.document_type, 'trainer_signature_evidence');
  assert.equal(doc.metadata.slot_id, 'slot-1');
  assert.equal(doc.metadata.trainer_profile_id, 'trainer-1');
});

test('delegated/assisted access cannot sign on behalf of the trainer', async () => {
  const f = fixture({ assisted: true });
  const body = new FormData();
  body.set('session_id', 'session-1');
  body.set('kind', 'trainer_signature');
  body.set('slot_id', 'slot-1');

  const response = await f.route.POST(new Request('https://site.test/api/client/daily/trainer-session-workspace', { method: 'POST', body }));
  assert.equal(response.status, 403);
  const json = await response.json();
  assert.match(json.error, /Consultation déléguée/);
});

test('unassigned session or foreign organisation is rejected', async () => {
  const f1 = fixture({ unassignedSession: true });
  const body1 = new FormData();
  body1.set('session_id', 'session-1');
  body1.set('kind', 'trainer_signature');
  body1.set('slot_id', 'slot-1');

  const res1 = await f1.route.POST(new Request('https://site.test/api/client/daily/trainer-session-workspace', { method: 'POST', body: body1 }));
  assert.equal(res1.status, 404);

  const f2 = fixture({ foreignOrg: true });
  const res2 = await f2.route.POST(new Request('https://site.test/api/client/daily/trainer-session-workspace', { method: 'POST', body: body1 }));
  assert.equal(res2.status, 404);
});

test('duplicate trainer signature on the same slot is prevented', async () => {
  const f = fixture({ alreadySigned: true });
  const body = new FormData();
  body.set('session_id', 'session-1');
  body.set('kind', 'trainer_signature');
  body.set('slot_id', 'slot-1');

  const response = await f.route.POST(new Request('https://site.test/api/client/daily/trainer-session-workspace', { method: 'POST', body }));
  assert.equal(response.status, 409);
  const json = await response.json();
  assert.match(json.error, /déjà enregistré/);
});
