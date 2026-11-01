import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { delegatedHarness, ids, token } from './helpers/delegatedRegistrationHarness.mjs';
import { loadTypeScript } from './helpers/loadTypeScript.mjs';

function walk(node){if(Array.isArray(node))return node.flatMap(walk);return node?.props?[node,...walk(node.props.children)]:[];}

function pageFixture(h,{providedToken=token,confirmed=true}={}) {
  const confirmations=[];const flags={confirmed};
  const window={sessionStorage:{getItem:()=>providedToken},confirm:text=>{confirmations.push(text);return flags.confirmed;},prompt:text=>text.startsWith('Motif')?'Session historique confirmée dans le dossier':''};
  const helper=loadTypeScript('components/AgentAssistanceBanner.tsx',{'react':React,'react/jsx-runtime':jsx},{window,Headers,fetch:h.fetcher,process:{env:{}}});
  const states=[],effects=[];let cursor=0;
  const page=loadTypeScript('app/client/daily/candidatures/page.tsx',{
    react:{...React,useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useEffect:effect=>effects.push(effect),useMemo:fn=>fn(),useCallback:fn=>fn},
    'react/jsx-runtime':jsx,'@/components/AgentAssistanceBanner':helper,
    '@/lib/daily/candidatureSummary':loadTypeScript('lib/daily/candidatureSummary.ts'),
    '@/components/ui/LoadingMascot':{default:()=>React.createElement('p',null,'Chargement')},
  },{window,Date,Error,fetch:()=>assert.fail('Page bypassed scoped assistance transport')});
  const render=()=>{cursor=0;return page.default();};
  async function settle(){for(let i=0;i<200&&(states[5]||states[6]);i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(states[5],false);assert.equal(states[6],'');return render();}
  async function mount(){render();effects.splice(0).forEach(effect=>effect());return settle();}
  async function click(label){const button=walk(render()).find(node=>node.type==='button'&&node.props.children===label);assert.ok(button,`Button ${label} missing`);assert.equal(button.props.disabled,false);button.props.onClick();return settle();}
  function choose(sessionId){walk(render()).find(node=>node.type==='select').props.onChange({target:{value:sessionId}});}
  return{mount,render,click,choose,confirmations,flags};
}

test('Page réelle → transport → API réelle → PostgreSQL : décisions et historique Studio',async t=>{
  const h=await delegatedHarness();t.after(()=>h.db.close());
  await t.test('boutons actifs et dossiers limités à l’organisme délégué',async()=>{
    await h.reset();const f=pageFixture(h),tree=await f.mount(),html=renderToStaticMarkup(tree);
    assert.equal(h.requests[0].headers.get('x-selen-agent-assistance'),token);
    assert.match(html,/Alice Exemple/);assert.doesNotMatch(html,/Foreign|Connecte-toi au compte responsable/);
    assert.match(html,/attribuées à votre compte Studio/);assert.match(html,/Ancienne version/);
    const buttons=walk(tree).filter(node=>node.type==='button'&&['Accepter et créer l’inscription','Refuser la candidature'].includes(node.props.children));
    assert.equal(buttons.length,2);assert.ok(buttons.every(button=>button.props.disabled===false));
  });
  await t.test('annulation explicite : aucune requête POST, aucune décision',async()=>{
    await h.reset();const f=pageFixture(h,{confirmed:false});await f.mount();
    const html=renderToStaticMarkup(await f.click('Accepter et créer l’inscription'));
    assert.match(f.confirmations[0],/votre identité Studio enregistrée/);assert.match(html,/Décision annulée/);
    assert.equal(h.requests.filter(req=>req.method==='POST').length,0);
    assert.equal(f.confirmations.length,0);
    assert.equal((await h.q('select count(*)::int as n from daily_registration_request_decisions')).rows[0].n,0);
  });
  await t.test('accepter produit l’inscription, la confirmation visible et le véritable auteur',async()=>{
    await h.reset();const f=pageFixture(h);await f.mount();const html=renderToStaticMarkup(await f.click('Accepter et créer l’inscription'));
    assert.match(html,/Inscription créée/);assert.match(html,/1 inscription liée/);assert.match(html,/Agent Studio · Agent Réel/);
    assert.match(html,/Candidature acceptée/);assert.equal(h.requests.filter(req=>req.method==='POST').length,1);
    assert.equal((await h.q('select actor_user_id from daily_registration_request_decisions')).rows[0].actor_user_id,ids.agent);
    assert.equal((await h.q('select count(*)::int as n from selen_agent_assistance_logs')).rows[0].n,1);
  });
  await t.test('refuser produit le statut visible et l’audit sans email',async()=>{
    await h.reset();const f=pageFixture(h);await f.mount();const html=renderToStaticMarkup(await f.click('Refuser la candidature'));
    assert.match(html,/Refusée/);assert.match(html,/Agent Studio · Agent Réel/);assert.equal(h.sends.length,0);
    assert.equal((await h.q('select count(*)::int as n from daily_session_enrolments')).rows[0].n,0);
  });
  await t.test('aucune session attachée : refus de décider sans choix explicite, puis inscription dans la session choisie',async()=>{
    await h.reset();await h.q('update daily_formation_registration_requests set attached_session_id=null where id=$1',[ids.request]);
    const f=pageFixture(h);await f.mount();
    const missing=renderToStaticMarkup(await f.click('Accepter et créer l’inscription'));
    assert.match(missing,/Sélectionnez une session compatible/);
    assert.equal(h.requests.filter(req=>req.method==='POST').length,0);
    assert.equal((await h.q('select count(*)::int as n from daily_registration_request_decisions')).rows[0].n,0);
    f.choose(ids.session);
    const accepted=renderToStaticMarkup(await f.click('Accepter et créer l’inscription'));
    assert.match(accepted,/Inscription créée/);
    assert.equal(h.requests.filter(req=>req.method==='POST').length,1);
    assert.equal((await h.q('select attached_session_id from daily_formation_registration_requests where id=$1',[ids.request])).rows[0].attached_session_id,ids.session);
  });
  await t.test('session archivée : non proposée et aucune décision écrite',async()=>{
    await h.reset();await h.q("update daily_sessions set status='archived' where id=$1",[ids.session]);
    const f=pageFixture(h);const html=renderToStaticMarkup(await f.mount());
    assert.doesNotMatch(html,/28.11.2026/);
    const missing=renderToStaticMarkup(await f.click('Accepter et créer l’inscription'));
    assert.match(missing,/Sélectionnez une session compatible/);
    assert.equal(h.requests.filter(req=>req.method==='POST').length,0);
  });
  await t.test('choix de la session historique : double confirmation et dossier conservé après changement de version',async()=>{
    await h.reset();const f=pageFixture(h);await f.mount();f.choose(ids.oldSession);
    const html=renderToStaticMarkup(await f.click('Accepter et créer l’inscription'));
    assert.equal(f.confirmations.length,2);assert.match(f.confirmations[0],/ancienne version du programme/);
    assert.match(html,/Alice Exemple/);assert.match(html,/Inscription créée/);assert.match(html,/Agent Studio · Agent Réel/);
    assert.equal((await h.q('select formation_id,attached_session_id from daily_formation_registration_requests where id=$1',[ids.request])).rows[0].formation_id,ids.oldFormation);
    assert.equal(h.rpcCalls[0].p_action,'accept_historical');assert.equal(h.rpcCalls[0].p_session_id,ids.oldSession);
  });
  await t.test('délégation expirée : aucun dossier affiché ni décision possible',async()=>{
    await h.reset();await h.db.exec("update selen_agent_assistance_tokens set expires_at=now()-interval '1 minute'");
    const html=renderToStaticMarkup(await pageFixture(h).mount());assert.match(html,/invalide ou expirée/);assert.doesNotMatch(html,/Alice Exemple/);assert.equal(h.rpcCalls.length,0);
  });
  await t.test('prérequis bloquants : erreur visible, aucune fausse réussite',async()=>{
    await h.reset();await h.db.exec('update daily_formation_registration_requests set prerequisites_validated=false');
    const f=pageFixture(h);await f.mount();const html=renderToStaticMarkup(await f.click('Accepter et créer l’inscription'));
    assert.match(html,/prérequis doivent être vérifiés/);assert.doesNotMatch(html,/Candidature acceptée/);assert.equal(h.sends.length,0);
    assert.equal((await h.q('select count(*)::int as n from daily_registration_request_decisions')).rows[0].n,0);
  });
});
