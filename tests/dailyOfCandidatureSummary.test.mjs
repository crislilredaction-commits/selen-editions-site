import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { loadTypeScript } from './helpers/loadTypeScript.mjs';

const forbidden = () => assert.fail('Network/SDK/mutation forbidden');
const projection = loadTypeScript('lib/daily/candidatureSummary.ts', {}, { fetch: forbidden });
const renderer = (Pdf = jsPDF) => loadTypeScript('lib/daily/candidatureSummaryPdf.ts', { jspdf: { jsPDF: Pdf }, './candidatureSummary': projection }, { fetch: forbidden });
const keys = ['motivation_summary','expectations_summary','positioning_summary','needs_summary','adaptations_summary','prerequisites_comment','observations'];
const fixture = (id = 'alpha', status = 'ready_for_of') => ({
  id, applicant_label: `Candidat ${id}`, formation_id: 'formation', formation_title: `Formation ${id}`,
  submitted_at: '2026-10-01T12:00:00Z', agent_analysis_completed_at: '2026-10-02T12:00:00Z',
  decision_status: status, response_type: 'beneficiary', can_decide: true,
  agent_analysis_summary: { ...Object.fromEntries(keys.map((k,i) => [k, `${id}_SENTINEL_${i}\nÉcole à Noël, prérequis étudiés.`])), evaluator_email: 'PRIVATE_EVALUATOR', unknown: 'PRIVATE_UNKNOWN' },
  participants: [{ secret: 'PRIVATE_PARTICIPANT' }], decisions: [{ comment: `Décision ${id}` }],
});
const jsx = (type, props) => ({ type, props });
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function text(tree) { if (tree == null || typeof tree === 'boolean') return ''; if (typeof tree !== 'object') return String(tree); if (Array.isArray(tree)) return tree.map(text).join(' '); return text(tree.props?.children); }
const tick = () => new Promise(resolve => setImmediate(resolve));
async function page(initialRows) {
  let rows = initialRows, cursor = 0, failure = '';
  const state = [], effects = [], fetches = [], downloads = [], urls = [], revoked = [], timers = [];
  const real = renderer();
  const pdf = { renderCandidatureSummaryPdf(row) { if (failure === 'renderer') throw Error('renderer'); return real.renderCandidatureSummaryPdf(row); } };
  const { default: Page } = loadTypeScript('app/client/daily/candidatures/page.tsx', {
    react: {
      useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
      useEffect(fn) { effects.push(fn); }, useMemo: fn => fn(), useCallback: fn => fn,
    }, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/components/ui/LoadingMascot': { default: () => null },
    '@/lib/daily/candidatureSummary': projection, '@/lib/daily/candidatureSummaryPdf': pdf,
  }, {
    fetch: async (url, options) => { assert.equal(url, '/api/client/daily/registration-requests'); assert.equal(options.method, undefined); fetches.push(url); return { ok: true, json: async () => ({ requests: rows, actor_types: ['organisation'], sessions: [{id:'session', formation_id:'formation', internal_reference:'SESSION_EXISTANTE'}] }) }; },
    Blob: class extends Blob { constructor(...args) { if (failure === 'blob') throw Error('blob'); super(...args); } },
    URL: { createObjectURL(blob) { if (failure === 'url') throw Error('url'); const url = `blob:test-${urls.length}`; urls.push({url,blob}); return url; }, revokeObjectURL(url) { revoked.push(url); } },
    document: { body: { appendChild(link) { link.attached = true; } }, createElement(tag) { assert.equal(tag,'a'); return { click() { if(failure==='download') throw Error('download'); downloads.push({href:this.href,name:this.download,attached:this.attached}); }, remove() { this.attached=false; } }; } },
    window: { confirm: forbidden, prompt: forbidden, setTimeout(fn, ms) { assert.equal(ms,1000); timers.push(fn); } },
  });
  function render() { cursor=0; return Page(); }
  render(); effects[0](); await tick();
  return { render, fetches, downloads, urls, revoked, flush() { timers.splice(0).forEach(fn=>fn()); }, fail(value) {failure=value;}, async reload(next) {rows=next;effects[0]();await tick();},
    async download(index=0) { const buttons=nodes(render()).filter(n=>n.type==='button'&&text(n).includes('Télécharger la synthèse')); buttons[index].props.onClick(); const busy=render(); assert.ok(text(busy).includes('Génération du PDF')); await tick(); return render(); },
  };
}
for (const status of ['ready_for_of','accepted','refused']) test(`real page: seven complete sections, order and preserved history ${status}`, async () => {
  const row=fixture('alpha',status); const h=await page([row]); const tree=h.render(), content=text(tree);
  for(let i=0;i<7;i++) assert.ok(content.includes(`alpha_SENTINEL_${i}`));
  const projected=projection.projectCandidatureSummary(row);
  const values=nodes(tree).filter(n=>n.type==='dd'); assert.deepEqual(values.map(n=>text(n)),Array.from(projected.sections,s=>s.value));
  for(const node of values) assert.equal(node.props.style.whiteSpace,'pre-wrap');
  for(const secret of ['PRIVATE_EVALUATOR','PRIVATE_UNKNOWN','PRIVATE_PARTICIPANT','[object Object]']) assert.ok(!content.includes(secret));
  if(status==='ready_for_of') { assert.ok(content.indexOf('alpha_SENTINEL_6')<content.indexOf('Accepter la candidature')); assert.ok(content.includes('Refuser la candidature')); }
  else { assert.ok(content.includes('Décision alpha')); assert.ok(content.includes(status==='accepted'?'Acceptée':'Refusée')); assert.ok(!content.includes('Accepter la candidature')); }
  if(status==='accepted') { assert.ok(content.includes('SESSION_EXISTANTE'));assert.ok(content.includes('Créer l\'inscription'));assert.ok(content.includes('Vérifier / réessayer')); }
  await h.download(); assert.equal(h.fetches.length,1);h.flush();assert.equal(h.revoked.length,1);
});
test('materialized history retains inscription count and email verification',async()=>{
  const h=await page([{...fixture('done','accepted'),materialized_at:'2026-10-02',materialized_count:2}]);const content=text(h.render());assert.ok(content.includes('Inscription créée'));assert.ok(content.includes('2'));assert.ok(content.includes('Vérifier / réessayer'));assert.ok(content.includes('done_SENTINEL_6'));
});
test('pending stays outside decision cards and has no export',async()=>{
  const h=await page([fixture('waiting','pending')]);const tree=h.render();assert.equal(nodes(tree).filter(n=>n.type==='button').length,0);assert.ok(!text(tree).includes('waiting_SENTINEL'));assert.ok(text(tree).includes('en cours d’analyse'));
});
for(const raw of [undefined,null,'bad',[],{}, {motivation_summary:' \n ',observations:{secret:'PRIVATE_OBJECT'},expectations_summary:42,evaluator_email:'PRIVATE_EVALUATOR'}]) test(`unavailable summary: ${JSON.stringify(raw)}`,async()=>{
  const row={...fixture(),agent_analysis_summary:raw,agent_analysis_completed_at:'invalid'};const h=await page([row]);const content=text(h.render());assert.ok(content.includes('Synthèse indisponible'));assert.ok(content.includes('Non renseigné'));assert.ok(!content.includes('Télécharger'));assert.ok(!content.includes('Invalid Date'));assert.ok(!content.includes('PRIVATE_'));assert.throws(()=>renderer().renderCandidatureSummaryPdf(row),/indisponible/);
});
test('partial summary stays honest and HTML is only a literal string in UI/PDF',async()=>{
  const row={...fixture(),agent_analysis_summary:{motivation_summary:'<b>Texte</b>\n<script>PRIVATE_LITERAL</script>',observations:{secret:'PRIVATE_OBJECT'}}};
  const h=await page([row]);const tree=h.render();assert.equal(nodes(tree).filter(n=>n.type==='dd'&&text(n)==='Non renseigné').length,6);assert.ok(!nodes(tree).some(n=>n.type==='script'||n.props?.dangerouslySetInnerHTML));assert.ok(text(tree).includes('<b>Texte</b>'));await h.download();const pdf=Buffer.from(await h.urls[0].blob.arrayBuffer()).toString('latin1');assert.ok(pdf.includes('<b>Texte</b>'));assert.ok(!pdf.includes('PRIVATE_OBJECT'));
});
test('download action uses correct card and refreshed DTO, safe filename and URL cleanup',async()=>{
  const a=fixture('alpha'),b=fixture('beta');b.applicant_label='../../École / <test> \\ :';const h=await page([a,b]);
  await h.download(1);let pdf=Buffer.from(await h.urls[0].blob.arrayBuffer()).toString('latin1');assert.match(pdf,/^%PDF-/);assert.ok(pdf.includes('beta_SENTINEL_6'));assert.ok(!pdf.includes('alpha_SENTINEL'));assert.equal(h.urls[0].blob.type,'application/pdf');assert.match(h.downloads[0].name,/^synthese-candidature-[a-z0-9-]+\.pdf$/);assert.equal(h.downloads[0].attached,true);h.flush();assert.deepEqual(h.revoked,[h.urls[0].url]);
  const updated={...a,agent_analysis_summary:Object.fromEntries(keys.map((k,i)=>[k,`FRESH_${i}`]))};await h.reload([updated,b]);assert.ok(!text(h.render()).includes('alpha_SENTINEL'));assert.ok(text(h.render()).includes('FRESH_6'));await h.download(0);pdf=Buffer.from(await h.urls[1].blob.arrayBuffer()).toString('latin1');assert.ok(pdf.includes('FRESH_6'));assert.ok(!pdf.includes('beta_SENTINEL'));assert.ok(!pdf.includes('alpha_SENTINEL'));for(const secret of ['PRIVATE_UNKNOWN','PRIVATE_EVALUATOR','PRIVATE_PARTICIPANT'])assert.ok(!pdf.includes(secret));assert.equal(h.fetches.length,2);assert.equal(updated.decision_status,'ready_for_of');h.flush();assert.equal(h.revoked.length,2);
});
for(const failure of ['renderer','blob','url','download']) test(`export failure ${failure}: visible error, retry, no decision mutation`,async()=>{
  const row=fixture(),h=await page([row]);h.fail(failure);let tree=await h.download();assert.ok(nodes(tree).some(n=>n.props?.role==='alert'&&text(n).includes('Réessayez')));assert.ok(nodes(tree).some(n=>n.type==='button'&&text(n).includes('Télécharger')&&!n.props.disabled));assert.equal(row.decision_status,'ready_for_of');h.flush();if(failure==='download')assert.equal(h.revoked.length,1);h.fail('');tree=await h.download();assert.ok(!nodes(tree).some(n=>n.props?.role==='alert'));assert.equal(h.downloads.length,1);assert.equal(h.fetches.length,1);h.flush();assert.equal(h.revoked.length,h.urls.length);
});
test('real jsPDF: every wrapped line exactly once, margins, accents, line breaks, many pages and final paragraph',()=>{
  const expected=[],drawn=[];let pages=1;
  class TrackedPDF extends jsPDF { constructor(options) {super(options);const split=this.splitTextToSize.bind(this),text=this.text.bind(this),add=this.addPage.bind(this);this.splitTextToSize=(...args)=>{const lines=split(...args);expected.push(...lines);return lines;};this.text=(line,x,y)=>{assert.equal(typeof line,'string');assert.equal(x,16);assert.ok(y>=18&&y<=278);assert.ok(this.getTextWidth(line)<=178.1);drawn.push(line);return text(line,x,y);};this.addPage=(...args)=>{pages++;return add(...args);};} }
  const row=fixture();row.agent_analysis_summary.observations=Array.from({length:400},(_,i)=>`LINE_${i} ${'École à Noël, prérequis étudiés. '.repeat(12)}`).join('\r\n')+'\n\nDERNIER_PARAGRAPHE';
  const pdf=Buffer.from(renderer(TrackedPDF).renderCandidatureSummaryPdf(row)).toString('latin1');assert.deepEqual(drawn,expected);assert.ok(pages>3);assert.equal(drawn.filter(v=>v==='DERNIER_PARAGRAPHE').length,1);assert.ok(drawn.includes(''));assert.ok(drawn.includes('École à Noël, prérequis étudiés.'));for(const label of ['Motivation','Attentes','Positionnement','Besoins','Adaptations','Prérequis','Observations'])assert.ok(drawn.includes(label));assert.ok(pdf.includes('DERNIER_PARAGRAPHE'));assert.ok(pdf.includes('École'));for(const secret of ['PRIVATE_UNKNOWN','PRIVATE_EVALUATOR','PRIVATE_PARTICIPANT','evaluator_email'])assert.ok(!pdf.includes(secret));
});

test('dates and scalar metadata never invent a date or stringify objects',()=>{
  for(const date of [undefined,null,{},'','   ','invalid','123','2026-02-30']) {
    const row={...fixture(),submitted_at:date,agent_analysis_completed_at:date,applicant_label:{secret:'PRIVATE_NAME'},formation_title:{secret:'PRIVATE_FORMATION'},decision_status:'__proto__'};
    const summary=projection.projectCandidatureSummary(row);assert.equal(summary.analyzedAt,'Non renseignée');assert.equal(summary.submittedAt,'Non renseignée');assert.equal(summary.status,'Non renseigné');
    const pdf=Buffer.from(renderer().renderCandidatureSummaryPdf(row)).toString('latin1');assert.ok(!pdf.includes('PRIVATE_'));assert.ok(!pdf.includes('[object Object]'));assert.ok(!pdf.includes('Invalid Date'));
  }
});
