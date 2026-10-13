import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { exchangeHarness, ids } from "./helpers/dailyTrainerExchangeHarness.mjs";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

function fixture(token="fixture-delegation") {
  const window={sessionStorage:{getItem:()=>token},confirm:()=>assert.fail("A real decision must not be clicked"),prompt:()=>assert.fail("No decision")};
  const h=exchangeHarness({window}); h.context.user={id:"agent"};
  h.db.daily_formations[0].organisation_id=ids.org;
  h.db.daily_formations.push({id:"foreign-formation",organisation_id:ids.other,title:"Foreign formation"});
  h.db.daily_formation_registration_requests=["Alice","Béatrice"].map((name,i)=>({id:`request-${i}`,formation_id:"formation",response_type:"beneficiary",respondent_first_name:name,respondent_last_name:"Exemple",status:"attached",decision_status:"ready_for_of",submitted_at:"2026-10-12",attached_session_id:ids.session}));
  h.db.daily_formation_registration_requests.push({id:"foreign-request",formation_id:"foreign-formation",status:"attached",decision_status:"ready_for_of",respondent_first_name:"Foreign"});
  h.db.daily_registration_request_decisions=[]; h.db.daily_registration_request_enrolments=[];
  const api=h.load("app/api/client/daily/registration-requests/route.ts",{
    "@/lib/server/dailyOrganisationContext":{getDailyOrganisationReadContext:async req=>req.headers.get("x-selen-agent-assistance")==="fixture-delegation"?h.context:{ok:false,status:401,error:"Connexion client requise."}},
    "@/lib/server/dailyLearnerPortalAccess":{sendLearnerPortalAccessForRegistrationRequest:()=>assert.fail("Live email forbidden")},
    "@/lib/server/dailyEnterprisePortalAccess":{sendEnterprisePortalAccessForRegistrationRequest:()=>assert.fail("Live email forbidden")},
  });
  const calls=[];
  const fetcher=async (url,init)=>{
    assert.equal(url,"/api/client/daily/registration-requests");
    const req=new Request(`https://daily.example.test${url}`,init); calls.push(req);
    return init?.method==="POST"?api.POST(req):api.GET(req);
  };
  const helper=loadTypeScript("components/AgentAssistanceBanner.tsx",{"react":React,"react/jsx-runtime":jsx},{window,Headers,fetch:fetcher,process:{env:{}}});
  const states=[],effects=[]; let cursor=0;
  const page=loadTypeScript("app/client/daily/candidatures/page.tsx",{
    react:{...React,useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==="function"?value(states[i]):value;}];},useEffect:effect=>effects.push(effect),useMemo:fn=>fn(),useCallback:fn=>fn},
    "react/jsx-runtime":jsx,
    "@/components/AgentAssistanceBanner":helper,
    "@/lib/daily/candidatureSummary":loadTypeScript("lib/daily/candidatureSummary.ts"),
    "@/components/ui/LoadingMascot":{default:()=>React.createElement("p",null,"Chargement")},
  },{window,Error,fetch:()=>assert.fail("Page bypassed scoped assistance transport")});
  const render=()=>{cursor=0;return page.default();};
  async function mount(){render();effects.splice(0).forEach(effect=>effect());for(let i=0;i<40&&states[5];i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(states[5],false);return render();}
  return{h,helper,calls,mount};
}
function walk(node){if(Array.isArray(node))return node.flatMap(walk);return node?.props?[node,...walk(node.props.children)]:[];}

test("page → transport de délégation → vraie API : deux dossiers du bon OF, boutons en lecture seule",async()=>{
  const f=fixture(); const tree=await f.mount(); const html=renderToStaticMarkup(tree);
  assert.equal(f.calls[0].headers.get("x-selen-agent-assistance"),"fixture-delegation");
  assert.match(html,/Alice Exemple/);assert.match(html,/Béatrice Exemple/);assert.doesNotMatch(html,/Foreign/);
  assert.match(html,/décisions sont réservées au responsable/);
  const buttons=walk(tree).filter(node=>node.type==="button"&&["Accepter et créer l’inscription","Refuser la candidature"].includes(node.props.children));
  assert.equal(buttons.length,4);assert.ok(buttons.every(button=>button.props.disabled===true));
  const before=f.h.reads.length;
  for(const action of [{decision:"accepted",session_id:ids.session},{decision:"refused"},{action:"materialize",session_id:ids.session},{action:"send_learner_access"}]){
    const response=await f.helper.assistanceFetch("/api/client/daily/registration-requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request_id:"request-0",...action})});
    assert.equal(response.status,403);
  }
  assert.equal(f.h.reads.length,before,"Les écritures sensibles sont rejetées avant toute lecture métier.");
});

test("sans délégation valide, l'interface affiche le refus sans révéler de dossier",async()=>{
  const f=fixture(""); const html=renderToStaticMarkup(await f.mount());
  assert.match(html,/Connexion client requise/);assert.doesNotMatch(html,/Alice Exemple|Béatrice Exemple/);assert.equal(f.h.reads.length,0);
});
