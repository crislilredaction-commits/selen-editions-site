import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { jsPDF } from 'jspdf';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function load(path, modules) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, Response, console, require(name) { assert.ok(name in modules, `Unexpected dependency: ${name}`); return modules[name]; },
    fetch() { assert.fail('Network forbidden'); },
  });
  return exports;
}
const formation = { id: 'f', user_id: 'owner', title: 'École / "test"', status: 'validated', creation_mode: 'selen_form', global_objective: 'GLOBAL', learning_objectives: ['OBJECTIVE_ONE', 'OBJECTIVE_TWO'], detailed_program: 'CONTENT', contact_phone: '0123456789', contact_email: 'contact@example.test', contact_website: 'https://example.test', public_registration_enabled: true, public_registration_token: 'token' };
const officialFields = ['target_audience', 'prerequisites', 'modality', 'modality_details', 'access_delays', 'registration_methods', 'price', 'pedagogical_methods', 'pedagogical_resources', 'evaluation_methods', 'accessibility'];
for (const field of officialFields) formation[field] = `OFFICIAL_${field}`;
formation.duration_hours = 14;
formation.duration_days = 2;
formation.internal_notes = 'PRIVATE_SENTINEL';
const organisation = { user_id: 'owner', organisation_name: 'ORGANISATION', address: 'ADDRESS', platform_contact_email: 'office@example.test' };
function database({ session = null, program = formation, errorTable } = {}) {
  const calls = [];
  return { calls, from(table) {
    assert.ok(['daily_sessions', 'daily_formations', 'daily_onboarding'].includes(table));
    const call = { table, filters: [] }; calls.push(call);
    const q = {
      select(fields) { call.fields = fields; return q; },
      eq(k,v) { call.filters.push(['eq', k,v]); return q; },
      neq(k,v) { call.filters.push(['neq', k,v]); return q; },
      gte() { return q; }, order() { return Promise.resolve({ data: [] }); },
      async maybeSingle() {
        let data = { daily_sessions: session, daily_formations: program, daily_onboarding: organisation }[table];
        if (data && !call.filters.every(([op,k,v]) => op === 'eq' ? data[k] === v : data[k] !== v)) data = null;
        return { data, error: table === errorTable ? { message: 'read failed' } : null };
      },
    }; return q;
  } };
}
function setup(options, Pdf = jsPDF) {
  const db = database(options);
  const renderer = load('lib/server/dailyRegistrationProgramPdf.ts', { jspdf: { jsPDF: Pdf } });
  const route = load('app/api/daily-registration/[token]/program-pdf/route.ts', {
    '@/lib/server/dailyRegistrationProgramPdf': renderer,
    '@/lib/server/clientNdaAccess': { getAdminSupabase: () => db },
    'next/server': { NextResponse: Response },
  });
  return { db, get: (token = 'token') => route.GET(new Request('https://example.test'), { params: Promise.resolve({ token }) }) };
}
const sessionFor = program => ({ user_id: 'owner', status: 'ready', registration_token: 'token', daily_formations: program });
for (const relation of [formation, [formation]]) test(`session PDF with ${Array.isArray(relation) ? 'array' : 'object'} relation`, async () => {
  const { get, db } = setup({ session: sessionFor(relation) });
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/pdf');
  assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="programme-ecole-test.pdf"');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const pdf = Buffer.from(await response.arrayBuffer()).toString('latin1');
  assert.match(pdf, /^%PDF-/);
  for (const value of ['GLOBAL', 'OBJECTIVE_ONE', 'OBJECTIVE_TWO', 'CONTENT', '0123456789', 'contact@example.test', 'https://example.test']) assert.ok(pdf.includes(value), value);
  for (const field of officialFields) assert.ok(pdf.includes(`OFFICIAL_${field}`));
  assert.ok(pdf.includes('14 h'));
  assert.ok(!pdf.includes('PRIVATE_SENTINEL'));
  assert.deepEqual(db.calls.map(c => c.table), ['daily_sessions', 'daily_onboarding']);
});
const cases = [
  ['public formation', {}, 'token', 200],
  ['legacy mode', { program: { ...formation, creation_mode: null } }, 'token', 200],
  ['unknown', {}, 'unknown', 404], ['empty', {}, ' ', 400],
  ['archived session', { session: { ...sessionFor(formation), status: 'archived' }, program: null }, 'token', 404],
  ['archived public formation', { program: { ...formation, status: 'archived' } }, 'token', 404],
  ['archived related formation', { session: sessionFor({ ...formation, status: 'archived' }) }, 'token', 404],
  ['disabled', { program: { ...formation, public_registration_enabled: false } }, 'token', 404],
  ['review', { program: { ...formation, status: 'review' } }, 'token', 409],
  ['import', { program: { ...formation, creation_mode: 'program_import' } }, 'token', 409],
  ['missing relation without fallback', { session: sessionFor(null) }, 'token', 404],
  ...['daily_sessions', 'daily_formations', 'daily_onboarding'].map(errorTable => [`error ${errorTable}`, { errorTable }, 'token', 500]),
];
for (const [name, options, token, status] of cases) test(name, async () => {
  const { get, db } = setup(options); assert.equal((await get(token)).status, status);
  if (name === 'empty') assert.equal(db.calls.length, 0);
  if (name === 'missing relation without fallback' || options.errorTable === 'daily_sessions') assert.equal(db.calls.length, 1);
  for (const call of db.calls.filter(c => c.table !== 'daily_onboarding')) {
    assert.match(call.fields, /creation_mode/); assert.match(call.fields, /learning_objectives/);
    assert.ok(call.filters.some(f => f.join() === 'neq,status,archived'));
  }
});
test('all wrapped lines are drawn once within margins across pages, including final paragraph', async () => {
  const expected = [], drawn = []; let pages = 1;
  class TrackedPDF extends jsPDF {
    constructor(options) {
      super(options);
      const split = this.splitTextToSize.bind(this), text = this.text.bind(this), add = this.addPage.bind(this);
      this.splitTextToSize = (...args) => { const lines = split(...args); expected.push(...lines); return lines; };
      this.text = (line, x, y) => { assert.equal(typeof line, 'string'); assert.equal(x, 16); assert.ok(y >= 18 && y <= 278, `y=${y}`); drawn.push(line); return text(line, x, y); };
      this.addPage = (...args) => { pages++; return add(...args); };
    }
  }
  const detailed_program = Array.from({ length: 400 }, (_, i) => `LINE_${i} ` + 'long content '.repeat(20)).join('\n') + '\nFINAL_SENTINEL';
  const { get } = setup({ program: { ...formation, detailed_program } }, TrackedPDF);
  const response = await get(); assert.equal(response.status, 200);
  assert.deepEqual(drawn, expected); assert.ok(pages > 3); assert.ok(drawn.includes('FINAL_SENTINEL'));
  assert.match(Buffer.from(await response.arrayBuffer()).toString('latin1'), /FINAL_SENTINEL/);
});
test('public API selects and returns actual import mode and objectives in both contexts', async () => {
  for (const session of [null, sessionFor({ ...formation, creation_mode: 'program_import' })]) {
    const db = database({ session, program: { ...formation, creation_mode: 'program_import' } });
    const { GET } = load('app/api/daily-registration/[token]/route.ts', {
      crypto: {}, 'next/server': { NextResponse: Response }, '@/lib/server/clientNdaAccess': { getAdminSupabase: () => db },
      '@/lib/server/dailyRegistrationEmails': {}, '@/lib/dailyBeneficiarySiret': {}, '@/lib/dailyRegistration': {},
    });
    const data = await (await GET(null, { params: Promise.resolve({ token: 'token' }) })).json();
    assert.equal(data.session.daily_formations.creation_mode, 'program_import');
    assert.deepEqual(data.session.daily_formations.learning_objectives, formation.learning_objectives);
    for (const c of db.calls.filter(c => c.fields.includes('title'))) { assert.match(c.fields, /creation_mode/); assert.match(c.fields, /learning_objectives/); }
  }
  const ui = read('components/daily/ProgramDetails.tsx');
  assert.match(ui, /\(formation.creation_mode \?\? "selen_form"\) === "selen_form"/);
  assert.match(ui, /learning_objectives\?\.join/);
});

test('interface hides the structured PDF for imports and shows it for validated Selen programmes', () => {
  const jsx = (type, props) => ({ type, props });
  for (const [mode, status, visible] of [['program_import', 'validated', false], ['selen_form', 'validated', true], [null, 'validated', true], ['selen_form', 'review', false]]) {
    const states = [{ ...formation, creation_mode: mode, status }, null, true];
    const { default: ProgramDetails } = load('components/daily/ProgramDetails.tsx', {
      react: { useEffect() {}, useState: () => [states.shift(), () => {}] },
      'react/jsx-runtime': { jsx, jsxs: jsx },
    });
    const tree = JSON.stringify(ProgramDetails({ token: 'token' }));
    assert.equal(tree.includes('/api/daily-registration/token/program-pdf'), visible);
  }
});
