import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from './helpers/loadTypeScript.mjs';
import {harness,ids} from './helpers/dailyOwnPositioningHarness.mjs';

async function view({company=false,loseFirstReply=false}={}) {
 const h=harness();Object.assign(h.formation,{positioning_mode:'selen',positioning_questionnaire_document_url:null,positioning_questions:[{id:'goal',label:'Objectif',type:'free_text',required:true}]});
 const draft={mode:company?'company':'beneficiary',step:company?5:6,submissionId:ids.submission,
  form:{first_name:'Alice',last_name:'Martin',email:'alice@example.test',phone:'0102030405',selected_session_id:ids.session,positioning_goal:'Progresser',admin_contact_name:'Alice',admin_contact_email:'alice@example.test',company_name:'Commanditaire'},participants:[h.subject]};
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
 const signature=find(n=>n.type===Signature);signature.props.onConsentChange(true);signature.props.onSignatureChange('data:image/png;base64,bW9jayBzaWduYXR1cmU=');render();
 async function submit(){const before=posts;find(n=>n.type==='button'&&n.props.children?.props?.children==='Signer et envoyer mon dossier').props.onClick();for(let i=0;i<100&&posts===before;i++)await new Promise(resolve=>setTimeout(resolve,5));await new Promise(resolve=>setTimeout(resolve,10));render();assert.equal(posts,before+1);}
 return{h,requests,storage,submit};
}
for(const company of [false,true])test(`actual ${company?'company':'beneficiary'} page sends its persistent transmission ID in JSON`,async()=>{
 const v=await view({company});await v.submit();assert.equal(v.requests[0].submission_id,ids.submission);assert.equal(v.h.db.daily_formation_registration_requests.length,1);assert.equal(v.h.sends.length,1);assert.equal(v.storage.size,0);
 if(!company)assert.equal(v.h.db.daily_formation_registration_requests[0].positioning_answers.questions[0].answer,'Progresser');
});
test('actual candidate page retries a lost response without a second candidature or confirmation',async()=>{
 const v=await view({loseFirstReply:true});await v.submit();assert.equal(v.storage.size,1);await v.submit();assert.equal(v.requests[0].submission_id,v.requests[1].submission_id);assert.equal(v.h.db.daily_formation_registration_requests.length,1);assert.equal(v.h.sends.length,1);assert.equal(v.storage.size,0);
});
