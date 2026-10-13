import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {exchangeHarness,ids} from './dailyTrainerExchangeHarness.mjs';
export function dashboardHarness(options={}) {
 const window={location:{search:'',reload(){}},addEventListener(){},removeEventListener(){}};
 const h=exchangeHarness({assisted:false,window});
 Object.assign(h.db.daily_formations[0],{organisation_id:ids.org});
 h.db.daily_formation_registration_requests=[{id:ids.trainer,formation_id:'formation',response_type:'beneficiary',respondent_first_name:'Alice',respondent_last_name:'Exemple',status:'attached',decision_status:'ready_for_of',agent_analysis_completed_at:'2026-10-13T10:00Z',submitted_at:'2026-10-12T09:00Z',attached_session_id:ids.session}];
 h.db.daily_registration_request_decisions=[];h.db.daily_registration_request_enrolments=[];
 const sends=[],network=[];
 const api=h.load('app/api/client/daily/registration-requests/route.ts',{'@/lib/server/dailyLearnerPortalAccess':{sendLearnerPortalAccessForRegistrationRequest:()=>{throw Error('Real email forbidden');}},'@/lib/server/dailyEnterprisePortalAccess':{sendEnterprisePortalAccessForRegistrationRequest:()=>{throw Error('Real email forbidden');}}});
 const actions=options.actions??[{id:`registration-request:${ids.trainer}`,priority:'medium',title:'Ancienne action de candidature',detail:'Ancienne action',href:'/client/daily/candidatures'}];
 async function fetcher(url,init){network.push(url);if(init?.method&&init.method!=='GET')throw Error('Business write forbidden');
  if(url.endsWith('registration-requests')){if(options.networkFailure)throw Error('Réseau candidatures indisponible');if(options.status)return Response.json({error:options.status===403?'Accès réservé au responsable':'Lecture candidatures indisponible'},{status:options.status});return api.GET(new Request('https://site.test/api/client/daily/registration-requests'));}
  const bodies={'/api/client/daily/formations':{formations:h.db.daily_formations},'/api/client/daily/sessions':{sessions:[h.session]},'/api/client/daily/action-center':{actions,sessionJourneys:[]},'/api/client/daily/onboarding':{onboarding:null},'/api/client/daily/workspace':{workspace:{organisation:{name:'Organisme exemple'},membership:{roles:options.roles??['manager']},trainers:[]}}};
  if(!Object.hasOwn(bodies,url))throw Error('Unexpected network '+url);return Response.json(bodies[url]);
 }
 const states=[],effects=[];let cursor=0;
 const Page=h.load('components/daily/DailyDashboardOverviewV2.tsx',{
  'react':{...React,useState:initial=>{const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return[states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useEffect:effect=>effects.push(effect)},
  '@/app/lib/supabase/client':{createSupabaseBrowserClient:()=>({auth:{signOut:()=>{throw Error('Sign out forbidden');}}})},
  '@/components/AgentAssistanceBanner':{assistanceFetch:fetcher},
  '@/components/ui/LoadingMascot':{__esModule:true,default:()=>React.createElement('p',null,'Chargement')},
  '@/lib/dailyDashboardCandidatures':h.load('lib/dailyDashboardCandidatures.ts'),
 });
 const render=()=>{cursor=0;return renderToStaticMarkup(React.createElement(Page.default));};
 async function boot(){render();effects.splice(0).forEach(effect=>effect());for(let i=0;i<30&&states[8]!==false;i++)await new Promise(resolve=>setImmediate(resolve));if(states[8]!==false)throw Error('Dashboard boot did not settle');return render();}
 return{...h,api,actions,network,sends,boot,render};
}
