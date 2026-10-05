import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from './helpers/loadTypeScript.mjs';
import {harness,ids} from './helpers/dailyOwnPositioningHarness.mjs';

async function view({company=false,loseFirstReply=false,companySubjects=null,startPositioning=false}={}) {
 const h=harness();Object.assign(h.formation,{positioning_mode:'selen',positioning_questionnaire_document_url:null,positioning_questions:[{id:'goal',label:'Objectif',type:'free_text',required:true}]});
 const subjects=companySubjects??[h.subject];
 const draft={mode:company?'company':'beneficiary',step:startPositioning?5:6,submissionId:ids.submission,
  form:{first_name:'Alice',last_name:'Martin',email:'alice@example.test',phone:'0102030405',selected_session_id:ids.session,positioning_goal:'Progresser',admin_contact_name:'Alice',admin_contact_email:'alice@example.test',company_name:'Commanditaire'},participants:subjects};
 const subjectKey=h.load('lib/daily/ownPositioning.ts').positioningSubjectKey;
 if(company&&!startPositioning)draft.form[`positioning_${subjectKey(subjects[0])}_goal`]='Progresser';
 const storage=new Map([['selen-daily-registration-candidate-token',JSON.stringify(draft)]]);
 const states=[],effects=[],requests=[];let cursor=0,tree,posts=0;
 function Signature(){}const jsx=(type,props)=>({type,props});
 const Page=loadTypeScript('app/daily-inscription/[token]/page.tsx',{
  react:{use:()=>({token:'candidate-token'}),useMemo:fn=>fn(),useEffect(fn){effects.push(fn);},useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];}},
  'react/jsx-runtime':{jsx,jsxs:jsx},'@/components/daily/ApplicationSignature':{default:Signature},'@/components/daily/BeneficiaryProfessionalSiretFields':{},'@/components/daily/ProgramDetails':{},'@/components/daily/OwnPositioningFiles':{},
  '@/lib/daily/ownPositioning':h.load('lib/daily/ownPositioning.ts'),'@/lib/dailyBeneficiarySiret':h.load('lib/dailyBeneficiarySiret.ts'),
 },{FormData,URLSearchParams,crypto:{randomUUID:()=>ids.submission},window:{location:{search:''},localStorage:{getItem:key=>storage.get(key),removeItem:key=>storage.delete(key)}},fetch:async(_url,options={})=>{
  if(options.method==='POST'){requests.push(JSON.parse(options.body));const response=await h.post(requests.at(-1));posts++;if(loseFirstReply&&posts===1)throw Error('simulated lost reply');return response;}
  return h.load('app/api/daily-registration/[token]/route.ts').GET(new Request('https://site.test'),h.params('candidate-token'));
 }}).default;
 const render=()=>{cursor=0;tree=Page({params:Promise.resolve({token:'candidate-token'})});};
 const nodes=(node=tree)=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children??null)];
 const find=predicate=>{const hits=nodes().filter(predicate);assert.equal(hits.length,1);return hits[0];};
 render();effects[0]();await new Promise(resolve=>setTimeout(resolve,25));render();
 const sign=()=>{const signature=find(n=>n.type===Signature);signature.props.onConsentChange(true);signature.props.onSignatureChange('data:image/png;base64,bW9jayBzaWduYXR1cmU=');render();};
 if(!startPositioning)sign();
 async function submit(expected=1){const before=posts;find(n=>n.type==='button'&&n.props.children?.props?.children==='Signer et envoyer mon dossier').props.onClick();for(let i=0;i<(expected?100:5)&&posts===before;i++)await new Promise(resolve=>setTimeout(resolve,5));await new Promise(resolve=>setTimeout(resolve,10));render();assert.equal(posts,before+expected);}
 return{h,requests,storage,submit,sign,render,nodes,find};
}
for(const company of [false,true])test(`actual ${company?'company':'beneficiary'} page sends its persistent transmission ID in JSON`,async()=>{
 const v=await view({company});await v.submit();assert.equal(v.requests[0].submission_id,ids.submission);assert.equal(v.h.db.daily_formation_registration_requests.length,1);assert.equal(v.h.sends.length,1);assert.equal(v.storage.size,0);
 assert.equal(v.h.db.daily_formation_registration_requests[0].positioning_answers.questions[0].answer,'Progresser');
 if(company)assert.equal(v.requests[0].positioning_answers.participants[0].email,'alice@example.test');
});
test('actual candidate page retries a lost response without a second candidature or confirmation',async()=>{
 const v=await view({loseFirstReply:true});await v.submit();assert.equal(v.storage.size,1);await v.submit();assert.equal(v.requests[0].submission_id,v.requests[1].submission_id);assert.equal(v.h.db.daily_formation_registration_requests.length,1);assert.equal(v.h.sends.length,1);assert.equal(v.storage.size,0);
});
test('actual company page records separate answers for two learners',async()=>{
 const subjects=[{first_name:'Alice',last_name:'Martin',email:'alice@example.test'},{first_name:'Bob',last_name:'Durand',email:'bob@example.test'}];
 const v=await view({company:true,companySubjects:subjects,startPositioning:true});
 const fields=v.nodes().filter(n=>n.props?.question?.id==='goal');assert.equal(fields.length,2);
 fields[0].props.onChange('Apprendre à lire');fields[1].props.onChange('Apprendre à écrire');v.render();
 v.find(n=>n.type==='button'&&n.props.children?.props?.children==='Continuer').props.onClick();v.render();v.sign();await v.submit();
 const row=v.h.db.daily_formation_registration_requests[0];assert.equal(row.positioning_answers.participants[0].questions[0].answer,'Apprendre à lire');assert.equal(row.positioning_answers.participants[1].questions[0].answer,'Apprendre à écrire');
});
test('actual company page blocks an incomplete learner questionnaire before network submission',async()=>{
 const v=await view({company:true,companySubjects:[{first_name:'Alice',last_name:'Martin',email:'alice@example.test'},{first_name:'Bob',last_name:'Durand',email:'bob@example.test'}]});
 await v.submit(0);assert.equal(v.requests.length,0);assert.equal(v.h.writes.length,0);assert.equal(v.h.sends.length,0);
});

for(const status of ['pending','ready_for_of'])test(`actual OF page consults received Selen answers when candidature is ${status}`,async()=>{
 const h=harness();Object.assign(h.formation,{positioning_mode:'selen',positioning_questionnaire_document_url:null,positioning_questions:[{id:'goal',label:'Objectif original',type:'free_text',required:true}]});
 assert.equal((await h.post(h.body({positioning_answers:{mode:'selen',questions:[{id:'goal',answer:'Apprendre à écrire'}]}}))).status,200);
 h.db.daily_formation_registration_requests[0].decision_status=status;h.formation.positioning_questions[0].label='Nouvelle version';
 const states=[],effects=[];let cursor=0,tree;const jsx=(type,props)=>({type,props});
 const Page=loadTypeScript('app/client/daily/candidatures/page.tsx',{
  react:{useCallback:fn=>fn,useMemo:fn=>fn(),useEffect:fn=>effects.push(fn),useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];}},
  'react/jsx-runtime':{jsx,jsxs:jsx},'@/components/ui/LoadingMascot':{},'@/lib/daily/candidatureSummary':loadTypeScript('lib/daily/candidatureSummary.ts'),
 },{fetch:async(_url,options)=>{assert.equal(options.cache,'no-store');return h.load('app/api/client/daily/registration-requests/route.ts').GET();}}).default;
 const render=()=>{cursor=0;tree=Page();};render();effects[0]();await new Promise(resolve=>setTimeout(resolve,25));render();
 const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
 const texts=node=>typeof node==='string'?node:!node||typeof node!=='object'?'':Array.isArray(node)?node.map(texts).join(' '):texts(node.props?.children);
 assert.match(texts(tree),/Objectif original/);assert.match(texts(tree),/Apprendre à écrire/);assert.doesNotMatch(texts(tree),/Nouvelle version|questionnaire_sha256|submission_fingerprint/);
 assert.equal(nodes(tree).some(n=>n.type==='button'&&String(n.props.children).includes('Accepter la candidature')),status==='ready_for_of');
 assert.equal(h.db.daily_formation_registration_requests.length,1);assert.equal(h.sends.length,1);
});
