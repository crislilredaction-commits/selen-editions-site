import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from './helpers/loadTypeScript.mjs';
import { harness,ids,filled } from './helpers/dailyOwnPositioningHarness.mjs';

function ui(mode='off_platform',fetchFailure=false) {
 const h=harness();if(mode==='selen'){h.formation.positioning_mode='selen';h.formation.positioning_questionnaire_document_url=null;h.formation.positioning_questions=[{id:'q1',label:'Objectif',type:'free_text',required:true,options:[]}];}
 const state=[],effects=[],requests=[];let cursor=0,tree;
 const jsx=(type,props)=>({type,props});function OwnFiles(){throw Error('Child upload must be driven explicitly');}
 const Page=loadTypeScript('app/daily/portail/[role]/[token]/positionnement/page.tsx',{
  'react/jsx-runtime':{jsx,jsxs:jsx},react:{use:()=>({role:'learner',token:'learner-token'}),useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useEffect(fn){if(!effects.length)effects.push(fn);}},
  '@/components/daily/OwnPositioningFiles':{default:OwnFiles},'@/lib/daily/ownPositioning':h.load('lib/daily/ownPositioning.ts'),
 },{FormData,File,crypto:{randomUUID:()=>ids.submission},fetch:async(url,options={})=>{
  assert.equal(url,'/api/daily-portal/learner-token/positioning');requests.push({url,options});if(fetchFailure&&options.method==='POST')throw Error('mock transport interrupted');
  const api=h.load('app/api/daily-portal/[token]/positioning/route.ts');return options.method==='POST'?api.POST(new Request('https://site.test',{...options}),h.params('learner-token')):api.GET(new Request('https://site.test'),h.params('learner-token'));
 }}).default;
 const render=()=>{cursor=0;tree=Page({params:Promise.resolve({role:'learner',token:'learner-token'})});};
 const nodes=(node=tree)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children??null)];
 const find=predicate=>{const matches=nodes().filter(predicate);assert.equal(matches.length,1);return matches[0];};
 render();return{h,requests,render,nodes,find,OwnFiles,async load(){effects[0]();await new Promise(resolve=>setTimeout(resolve,20));render();},async submit(){await find(n=>n.type==='form').props.onSubmit({preventDefault(){}});render();}};
}
test('learner page blocks empty deposit then sends actual multipart and shows received file',async()=>{
 const view=ui();await view.load();let button=view.find(n=>n.props?.type==='submit');assert.equal(button.props.disabled,true);
 const picker=view.find(n=>n.type===view.OwnFiles);assert.equal(picker.props.downloadUrl,'/api/daily-portal/learner-token/positioning-document');
 picker.props.onChange('subject',new File([filled],'Alice.pdf',{type:'application/pdf'}));view.render();button=view.find(n=>n.props?.type==='submit');assert.equal(button.props.disabled,false);await view.submit();
 const request=view.requests.find(r=>r.options.method==='POST');assert.ok(request.options.body instanceof FormData);assert.equal(request.options.headers['Content-Type'],undefined);
 assert.equal(request.options.body.get('positioning_source_id'),ids.source);assert.ok(request.options.body.get('positioning_file_0') instanceof File);
 const download=view.find(n=>n.type==='a'&&n.props.children==='Télécharger mon document rempli');assert.match(download.props.href,/positioning-document\?id=/);assert.equal(view.h.uploads.length,1);assert.equal(view.h.sends.length,0);
});
test('interrupted learner transfer retains the selected file and enables the same retry',async()=>{
 const view=ui('off_platform',true);await view.load();view.find(n=>n.type===view.OwnFiles).props.onChange('subject',new File([filled],'Alice.pdf',{type:'application/pdf'}));view.render();await view.submit();
 assert.equal(view.find(n=>n.props?.type==='submit').props.disabled,false);assert.ok(view.find(n=>n.type===view.OwnFiles).props.rows[0].file);assert.equal(view.h.uploads.length,0);assert.ok(view.nodes().some(n=>n.type==='p'&&String(n.props.children).includes('Réessayez avec le même document')));
});
test('Selen questionnaire still posts its answers as JSON',async()=>{
 const view=ui('selen');await view.load();view.find(n=>n.type==='textarea').props.onChange({target:{value:'Mon objectif'}});view.render();await view.submit();
 const request=view.requests.find(r=>r.options.method==='POST');assert.equal(request.options.headers['Content-Type'],'application/json');assert.equal(JSON.parse(request.options.body).answers.q1,'Mon objectif');assert.equal(view.h.uploads.length,0);
});
