import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {exchangeHarness,ids} from "./helpers/dailyTrainerExchangeHarness.mjs";
const api="app/api/client/daily/assisted-trainer-workspace/route.ts";
const request=(params="")=>new Request("https://site.test/api/client/daily/assisted-trainer-workspace"+params);
const selection=`?trainer_id=${ids.trainer}&session_id=${ids.session}`;

test("une dirigeante externe affectée est consultable sans jeton de portail ni profil lié par user_id",async()=>{
 const h=exchangeHarness(),r=await h.load(api).GET(request()),body=await r.json();
 assert.equal(r.status,200);assert.equal(body.spaces.length,1);assert.equal(body.spaces[0].trainerId,ids.trainer);assert.equal(body.spaces[0].sessionId,ids.session);
 assert.ok(h.reads.every(r=>["daily_trainer_profiles","daily_sessions"].includes(r.table)));
});
test("la sélection ouvre les présences canoniques, sans historique annulé ni preuve privée",async()=>{
 const h=exchangeHarness(),before=JSON.stringify(h.db),r=await h.load(api).GET(request(selection)),body=await r.json();
 assert.equal(r.status,200);assert.equal(body.readOnly,true);assert.equal(body.enrolments.length,1);assert.equal(body.records.length,1);
 assert.equal(body.records[0].status,"present");assert.equal(body.records[0].signed_at,"2026-10-12T10:00:00Z");assert.equal(body.records[0].signature_storage_path,undefined);
 assert.equal(JSON.stringify(h.db),before);assert.equal(h.logs.length,1);assert.equal(h.logs[0].metadata.trainer_profile_id,ids.trainer);
 const Component=h.load("components/daily/AssistedTrainerAttendance.tsx").default;
 const html=renderToStaticMarkup(React.createElement(Component,{data:body}));assert.match(html,/Formatrice exemple/);assert.match(html,/Alice Exemple/);assert.match(html,/Signé/);assert.doesNotMatch(html,/Historique Annulé|private-proof|<form|<button/);
});
for(const change of [h=>h.context.assisted=false,h=>h.context.assistance=null])test("aucun repli sur le compte personnel de l’agent",async()=>{
 const h=exchangeHarness();change(h);const r=await h.load(api).GET(request(selection));assert.equal(r.status,403);assert.equal(h.reads.length,0);
});
for(const change of [h=>h.trainer.active=false,h=>h.trainer.status="archived",h=>h.trainer.organisation_id=ids.other,h=>h.session.organisation_id=ids.other,h=>h.session.trainer_ids=[]])test("un profil inactif, étranger ou non affecté ne donne pas accès à la session",async()=>{
 const h=exchangeHarness();change(h);const r=await h.load(api).GET(request(selection));assert.equal(r.status,404);assert.equal(h.logs.length,0);assert.ok(h.reads.every(r=>["daily_trainer_profiles","daily_sessions"].includes(r.table)));
});
test("aucun choix implicite lorsque la paire formateur/session est incomplète",async()=>{
 const h=exchangeHarness(),r=await h.load(api).GET(request(`?trainer_id=${ids.trainer}`));assert.equal(r.status,400);assert.equal(h.reads.length,0);
});
test("une erreur Supabase reste une erreur et ne devient pas une liste vide",async()=>{
 const h=exchangeHarness({failTable:"daily_attendance_slots"}),r=await h.load(api).GET(request(selection));assert.equal(r.status,500);assert.match((await r.json()).error,/fixture read failure/);assert.equal(h.logs.length,0);
});
test("le mode délégué ne permet aucune signature ni écriture",async()=>{
 const h=exchangeHarness(),before=JSON.stringify(h.db),r=await h.load(api).POST(request(selection));assert.equal(r.status,403);assert.equal(h.reads.length,0);assert.equal(JSON.stringify(h.db),before);
});
test("un créneau terminé sans signature reste en attente de régularisation",async()=>{
 const h=exchangeHarness();h.db.daily_attendance_records=[];const body=await(await h.load(api).GET(request(selection))).json();
 const html=renderToStaticMarkup(React.createElement(h.load("components/daily/AssistedTrainerAttendance.tsx").default,{data:body}));assert.match(html,/En attente de régularisation/);assert.match(html,/Non signée/);assert.doesNotMatch(html,/>Absent</);
});
test("les créneaux annulés et leurs signatures sont exclus de la consultation courante",async()=>{
 const h=exchangeHarness();h.db.daily_attendance_slots[0].status="cancelled";const body=await(await h.load(api).GET(request(selection))).json();assert.equal(body.slots.length,0);assert.equal(body.records.length,0);
});
test("l’accès personnel du dirigeant retrouve toujours son profil externe par e-mail",async()=>{
 const h=exchangeHarness({assisted:false}),r=await h.load("app/api/client/daily/trainer-profile/route.ts").GET(request());assert.equal(r.status,200);assert.equal((await r.json()).profile.id,ids.trainer);
});
test("le suivi personnel retrouve uniquement la session affectée sans portail formateur",async()=>{
 const h=exchangeHarness({assisted:false}),r=await h.load("app/api/client/daily/trainer-followup/route.ts").GET(request());
 assert.equal(r.status,200);assert.deepEqual((await r.json()).sessions.map(session=>session.id),[ids.session]);
});
test("les espaces personnel et délégué partagent les présences actives de la session",async()=>{
 const h=exchangeHarness({assisted:false}),before=JSON.stringify(h.db);
 const personal=await h.load("app/api/client/daily/trainer-session-workspace/route.ts").GET(request(`?session_id=${ids.session}`));assert.equal(personal.status,200);
 const p=await personal.json();h.context.assisted=true;
 const delegated=await(await h.load(api).GET(request(selection))).json();
 assert.deepEqual(p.records.map(row=>row.id),delegated.records.map(row=>row.id));assert.equal(p.records.length,1);assert.equal(p.enrolments.length,1);assert.equal(JSON.stringify(h.db),before);
});
for(const failTable of ["daily_session_enrolments","daily_attendance_slots","daily_attendance_records","daily_documents"])test(`l'accès personnel signale l'échec ${failTable}`,async()=>{
 const h=exchangeHarness({assisted:false,failTable}),r=await h.load("app/api/client/daily/trainer-session-workspace/route.ts").GET(request(`?session_id=${ids.session}`));assert.equal(r.status,500);assert.match((await r.json()).error,/fixture read failure/);
});
for(const change of [h=>h.session.trainer_ids=[],h=>h.session.organisation_id=ids.other])test("le suivi personnel refuse une session non affectée ou étrangère",async()=>{
 const h=exchangeHarness({assisted:false});change(h);const r=await h.load("app/api/client/daily/trainer-session-workspace/route.ts").GET(request(`?session_id=${ids.session}`));assert.equal(r.status,404);assert.ok(h.reads.every(read=>read.table==="daily_sessions"));
});
test("le suivi personnel ne propose pas les créneaux annulés ni leurs présences",async()=>{
 const h=exchangeHarness({assisted:false});h.db.daily_attendance_slots[0].status="cancelled";
 const body=await(await h.load("app/api/client/daily/trainer-session-workspace/route.ts").GET(request(`?session_id=${ids.session}`))).json();assert.equal(body.slots.length,0);assert.equal(body.records.length,0);
});
test("une erreur de chargement des présences est réellement visible dans l'espace personnel",()=>{
 const h=exchangeHarness({assisted:false}),states=["",[h.session],ids.session,[],[h.enrolment],[],"note","attention","","","","","fixture","","",false,[],[],[],false,"","Suivi des présences indisponible."];let index=0;
 const Card=({children})=>React.createElement("section",null,children);
 const Page=h.load("app/client/daily/formateur/suivi-sessions/page.tsx",{
  "react":{...React,useState:()=>[states[index++],()=>{}],useEffect:()=>{}},
  "@/components/ui/SelenButton":{__esModule:true,default:({children})=>React.createElement("button",null,children)},
  "@/components/ui/SelenCard":{__esModule:true,default:Card,SelenCardTitle:Card},
 }).default;
 const html=renderToStaticMarkup(React.createElement(Page));assert.match(html,/role="alert"/);assert.match(html,/Suivi des présences indisponible/);assert.match(html,/Réessayer le chargement/);assert.doesNotMatch(html,/Présences recueillies|Importer dans la session/);
});
test("le sélecteur affiche un lien pour une affectation canonique sans portail historique",async()=>{
 const h=exchangeHarness(),spaces=(await(await h.load(api).GET(request())).json()).spaces;
 const states=[[],spaces,false,"",""];let index=0;
 const Page=h.load("app/client/daily/formateur/assistance/page.tsx",{"react":{...React,useState:()=>[states[index++],()=>{}],useEffect:()=>{}},"@/components/AgentAssistanceBanner":{assistanceFetch:()=>{throw Error("Real network forbidden");}},"@/components/ui/LoadingMascot":{__esModule:true,default:()=>null}}).default;
 const html=renderToStaticMarkup(React.createElement(Page));assert.match(html,/Ouvrir le suivi de cette session/);assert.match(html,new RegExp(`trainer_id=${ids.trainer}`));assert.match(html,new RegExp(`session_id=${ids.session}`));assert.doesNotMatch(html,/Aucun espace formateur délégué/);
});

for (const [path,assisted,redirect] of [
 ["/client/daily/formateur",false,false],
 ["/client/daily/formateur/assistance",true,false],
 ["/client/daily/formateur/assistance/session",true,false],
 ["/client/daily/formateur",true,true],
 ["/client/daily/formateur/assistance/session/autre",true,true],
]) test(`le layout contrôle réellement l'accès ${path} (assistance=${assisted})`,()=>{
 const href=`https://site.test${path}${assisted?"?assistanceToken=fixture&assistanceReturnTo=studio":""}`;
 const h=exchangeHarness({window:{location:{href,origin:"https://site.test"}}});
 const effects=[],destinations=[],ready=[];
 const Layout=h.load("app/client/daily/formateur/layout.tsx",{
  "react":{...React,useState:()=>[false,value=>ready.push(value)],useEffect:effect=>effects.push(effect)},
  "next/navigation":{usePathname:()=>path,useRouter:()=>({replace:destination=>destinations.push(destination)})},
  "@/components/AgentAssistanceBanner":{getStoredAssistanceToken:()=>null},
  "@/components/ui/LoadingMascot":{__esModule:true,default:()=>null},
 }).default;
 renderToStaticMarkup(React.createElement(Layout,null,"Espace personnel"));effects.forEach(effect=>effect());
 assert.equal(destinations.length,redirect?1:0);assert.deepEqual(ready,redirect?[]:[true]);
 if(redirect)assert.equal(destinations[0],"/client/daily/formateur/assistance?assistanceToken=fixture&assistanceReturnTo=studio");
});
