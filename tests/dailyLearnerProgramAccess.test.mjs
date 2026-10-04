import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { loadTypeScript } from './helpers/loadTypeScript.mjs';

const fields = 'id,organisation_id,status,creation_mode,public_registration_enabled,public_registration_token';
const publicToken = 'public/+?é%#';
const url = `/api/daily-registration/${encodeURIComponent(publicToken)}/program-pdf`;
const networkForbidden = () => assert.fail('Network forbidden');
function fixture(options = {}) {
  const access = { id: 'access', token: 'portal-secret', status: 'pending', portal_type: 'learner', session_id: 'session', user_id: 'owner', entity_key: 'learner:learner', entity_email: 'learner@example.test', ...options.access };
  const formation = options.absent ? null : { id: 'formation', organisation_id: 'org', status: 'validated', creation_mode: 'selen_form', public_registration_enabled: true, public_registration_token: publicToken, ...options.formation };
  const session = { id: 'session', formation_id: 'formation', organisation_id: 'org', status: 'ready', daily_formations: { id: 'formation', title: 'Existing DTO' }, registration_token: 'never-use-session-token', ...options.session };
  const enrolment = { id: 'enrolment', session_id: 'session', organisation_id: 'org', learner_id: 'learner', status: 'active', daily_learners: { id: 'learner', email: 'learner@example.test' }, ...options.enrolment };
  const db = { daily_portal_access_tokens: [access], daily_sessions: [session], daily_session_enrolments: [enrolment], daily_formations: formation ? [formation] : [], daily_onboarding: [], daily_registration_responses: [], daily_conventions: [], daily_trainers: [], daily_convocations: [], daily_documents: [] };
  const calls = [], mutations = [];
  const admin = { from(table) {
    assert.ok(Object.hasOwn(db, table), table);
    const call = { table, filters: [] }; calls.push(call);
    let one = false, update;
    const q = {
      select(value) { call.fields = value; if (table === 'daily_formations') assert.equal(value, fields); return q; },
      eq(k,v) { call.filters.push(['eq',k,v]); return q; },
      neq(k,v) { call.filters.push(['neq',k,v]); return q; },
      not(k,op,v) { assert.equal(op,'in'); call.filters.push(['not',k,v.slice(1,-1).split(',')]); return q; },
      in(k,v) { call.filters.push(['in',k,v]); return q; },
      order(k,v) { assert.equal(k,'created_at'); assert.equal(v.ascending,false); return q; },
      update(value) { assert.equal(table,'daily_portal_access_tokens'); assert.ok(['viewed','revoked','expired'].includes(value.status)); update=value; return q; },
      maybeSingle() { one=true; return q; },
      then(resolve,reject) { return Promise.resolve().then(() => {
        if (table === 'daily_formations') {
          assert.deepEqual(call.filters,[['eq','id',session.formation_id],['eq','organisation_id',session.organisation_id]]);
          assert.equal(access.portal_type,'learner');
          assert.ok(!['declined','cancelled','abandoned'].includes(enrolment.status));
          if (options.readError) return {data:null,error:{message:'Public programme read failed'}};
        }
        const rows=db[table].filter(row=>call.filters.every(([op,k,v])=>op==='eq'?row[k]===v:op==='neq'?row[k]!==v:op==='in'?v.includes(row[k]):!v.includes(row[k])));
        if(update) { mutations.push(JSON.parse(JSON.stringify(update))); rows.forEach(row=>Object.assign(row,update)); }
        return {data:one?rows[0]??null:rows,error:null};
      }).then(resolve,reject); },
    }; return q;
  } };
  const { GET } = loadTypeScript('app/api/daily-portal/[token]/route.ts', {
    'next/server': { NextResponse: Response }, '@/lib/server/clientNdaAccess': { getAdminSupabase:()=>admin },
  }, {fetch:networkForbidden});
  return { calls, mutations, session, get:()=>GET(null,{params:Promise.resolve({token:'portal-secret'})}) };
}
for (const mode of ['selen_form',null,undefined]) test(`GET public programme / mode ${mode}`,async()=>{
  const h=fixture({formation:{creation_mode:mode}}); const response=await h.get(); const body=await response.json();
  assert.equal(response.status,200); assert.equal(body.publicProgramPdfUrl,url);
  assert.deepEqual(body.session.daily_formations,h.session.daily_formations);
  assert.deepEqual(body.documents,[]);
  for(const secret of ['portal-secret','never-use-session-token','public_registration_enabled','creation_mode']) assert.ok(!JSON.stringify(body).includes(secret),secret);
  assert.deepEqual(h.mutations.map(m=>m.status),['viewed']);
});
for(const [name,options] of [
  ['wrong OF',{formation:{organisation_id:'other'}}],['wrong id',{formation:{id:'other'}}],['absent',{absent:true}],
  ...['draft','review','archived'].map(status=>[status,{formation:{status}}]),
  ['import',{formation:{creation_mode:'program_import'}}],['disabled',{formation:{public_registration_enabled:false}}],
  ...['',null,'   '].map(public_registration_token=>[`token ${public_registration_token}`,{formation:{public_registration_token}}]),
  ['missing session formation',{session:{formation_id:null}}],['missing OF',{session:{organisation_id:null}}],
]) test(`GET no fallback: ${name}`,async()=>{const h=fixture(options);const r=await h.get();assert.equal(r.status,200);assert.equal(Object.hasOwn(await r.json(),'publicProgramPdfUrl'),false);});
for(const role of ['enterprise','trainer']) test(`no public programme read for ${role}`,async()=>{const h=fixture({access:{portal_type:role}});const r=await h.get();assert.equal(r.status,200);assert.equal(Object.hasOwn(await r.json(),'publicProgramPdfUrl'),false);assert.ok(!h.calls.some(c=>c.table==='daily_formations'));});
for(const [name,options,status,mutation] of [
  ['revoked',{access:{status:'revoked'}},403,null],['expired',{access:{status:'expired'}},403,null],
  ['past expiry',{access:{expires_at:'2000-01-01'}},410,'expired'],['archived session',{session:{status:'archived'}},404,null],
  ...['declined','cancelled','abandoned'].map(status=>[status,{enrolment:{status}},403,'revoked']),
]) test(`existing refusal precedes public read: ${name}`,async()=>{const h=fixture(options);const r=await h.get();assert.equal(r.status,status);assert.ok(!h.calls.some(c=>c.table==='daily_formations'));assert.deepEqual(h.mutations.map(m=>m.status),mutation?[mutation]:[]);});
test('public read error is an explicit 500',async()=>{const h=fixture({readError:true});const r=await h.get();assert.equal(r.status,500);assert.deepEqual(await r.json(),{error:'Public programme read failed'});});

const jsx=(type,props)=>({type,props});
function nodes(tree) { if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(nodes);return [tree,...nodes(tree.props?.children)]; }
async function render(name,{available=true,role='apprenant',resourceFailure=false,docs=[],selected='before'}={}) {
  const state=[], effects=[]; let cursor=0;
  const portal={access:{portalType:role==='entreprise'?'enterprise':'learner'},session:{start_date:'2099-01-01',end_date:'2099-01-02'},enrolment:{},...(available?{publicProgramPdfUrl:url}:{})};
  const roles=loadTypeScript('lib/daily/portalRoleConfig.ts');
  const {default:Component}=loadTypeScript(`components/daily/${name}.tsx`,{
    react:{useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=v;}];},useEffect(fn){effects.push(fn);},useMemo:fn=>fn()},
    'react/jsx-runtime':{jsx,jsxs:jsx}, '@/lib/daily/portalRoleConfig':roles,
  },{fetch:async(path)=>{if(path.endsWith('/resources')){if(resourceFailure==='reject')throw new Error('Private resources unavailable');return {ok:!resourceFailure,json:async()=>({documents:docs})};}assert.equal(path,'/api/daily-portal/portal-secret');return {ok:true,json:async()=>portal};}});
  Component({role,token:'portal-secret'}); effects[0]();await new Promise(resolve=>setImmediate(resolve));cursor=0;
  if(name==='LearnerPhaseNavigation')state[2]=selected;
  return Component({role,token:'portal-secret'});
}
for(const name of ['LearnerPhaseNavigation','DailyStakeholderWorkspace']) {
  for(const resourceFailure of [false,'http','reject']) test(`${name}: public link survives empty/failed private resources ${resourceFailure}`,async()=>{
    const tree=await render(name,{resourceFailure});const link=nodes(tree).find(n=>n.type==='a'&&n.props.href===url);
    assert.ok(link);assert.equal(link.props.children,'Télécharger le programme complet (PDF)');assert.equal(link.props.target,'_blank');assert.equal(link.props.rel,'noreferrer');
    const serialized=JSON.stringify(tree);assert.ok(!serialized.includes('Aucun document'));assert.ok(!serialized.includes('training_contract'));assert.ok(serialized.includes(name==='LearnerPhaseNavigation'?'Aucune convocation publiée':'Elle n\'est pas encore disponible'));
  });
  for(const options of [{available:false},{role:'entreprise'}])test(`${name}: unavailable/enterprise ${JSON.stringify(options)}`,async()=>{assert.ok(!nodes(await render(name,options)).some(n=>n.type==='a'&&n.props.href===url));});
  test(`${name}: existing private programme and published documents retained`,async()=>{const tree=await render(name,{docs:[{id:'private',document_type:'training_program'},{id:'published',logical_name:'Livret publié'}]});const links=nodes(tree).filter(n=>n.type==='a').map(n=>n.props.href);assert.ok(links.includes(url));for(const id of ['private','published'])assert.ok(links.includes(`/api/daily-portal/portal-secret/document?id=${id}`));});
}
test('public addition stays in Before tab',async()=>{for(const selected of ['during','after'])assert.ok(!nodes(await render('LearnerPhaseNavigation',{selected})).some(n=>n.props?.href===url));});
test('follow GET URL to real PDF route and renderer, including last paragraph',async()=>{
  const body=await(await fixture().get()).json();const token=decodeURIComponent(body.publicProgramPdfUrl.split('/')[3]);assert.equal(token,publicToken);
  const program={id:'formation',user_id:'owner',title:'Complete',status:'validated',creation_mode:'selen_form',public_registration_enabled:true,public_registration_token:publicToken,global_objective:'GLOBAL',learning_objectives:['OBJECTIVE_ONE','OBJECTIVE_TWO'],detailed_program:Array.from({length:400},(_,i)=>`LINE_${i} ${'long content '.repeat(20)}`).join('\n')+'\nFINAL_SENTINEL'};
  const calls=[];
  const admin={from(table){assert.ok(['daily_sessions','daily_formations','daily_onboarding'].includes(table));calls.push(table);const q={select(){return q;},eq(k,v){if(k==='registration_token'||k==='public_registration_token')assert.equal(v,publicToken);return q;},neq(k,v){assert.equal(k,'status');assert.equal(v,'archived');return q;},async maybeSingle(){return {data:table==='daily_formations'?program:null,error:null};}};return q;}};
  const renderer=loadTypeScript('lib/server/dailyRegistrationProgramPdf.ts',{jspdf:{jsPDF}},{fetch:networkForbidden});
  const {GET}=loadTypeScript('app/api/daily-registration/[token]/program-pdf/route.ts',{'next/server':{NextResponse:Response},'@/lib/server/clientNdaAccess':{getAdminSupabase:()=>admin},'@/lib/server/dailyRegistrationProgramPdf':renderer},{Response,fetch:networkForbidden});
  const response=await GET(null,{params:Promise.resolve({token})});assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/pdf');const pdf=Buffer.from(await response.arrayBuffer()).toString('latin1');for(const value of ['%PDF-','GLOBAL','OBJECTIVE_ONE','OBJECTIVE_TWO','LINE_399','FINAL_SENTINEL'])assert.ok(pdf.includes(value),value);assert.ok((pdf.match(/\/Type \/Page\b/g)||[]).length>3);assert.deepEqual(calls,['daily_sessions','daily_formations','daily_onboarding']);
});
