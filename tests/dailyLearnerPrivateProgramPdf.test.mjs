import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

function setup({ role="learner", status="active", enrolmentStatus="active", formationStatus="validated", creationMode="selen_form", expiresAt=null }={}) {
 const access={token:"portal-secret",session_id:"session",portal_type:role,entity_key:"learner:learner",entity_email:"learner@example.test",status,expires_at:expiresAt};
 const session={id:"session",organisation_id:"org",formation_id:"formation",user_id:"owner",status:"ready"};
 const enrolment={learner_id:"learner",session_id:"session",organisation_id:"org",status:enrolmentStatus,daily_learners:{email:"learner@example.test"}};
 const formation={id:"formation",user_id:"owner",title:"Programme",status:formationStatus,creation_mode:creationMode,organisation_id:"org"};
 const db={daily_portal_access_tokens:[access],daily_sessions:[session],daily_session_enrolments:[enrolment],daily_formations:[formation],daily_onboarding:[{user_id:"owner",organisation_name:"OF"}]};
 const calls=[];
 const admin={from(table){calls.push(table);let filters=[],single=false;const q={
  select(){return q;},eq(k,v){filters.push(["eq",k,v]);return q;},neq(k,v){filters.push(["neq",k,v]);return q;},
  not(k,op,v){assert.equal(op,"in");filters.push(["not",k,v.slice(1,-1).split(",")]);return q;},
  maybeSingle(){single=true;return q;},then(resolve,reject){return Promise.resolve().then(()=>{
   const rows=db[table].filter(row=>filters.every(([op,k,v])=>op==="eq"?row[k]===v:op==="neq"?row[k]!==v:!v.includes(row[k])));
   return {data:single?rows[0]??null:rows,error:null};
  }).then(resolve,reject);}
 };return q;}};
 const {GET}=loadTypeScript("app/api/daily-portal/[token]/program-pdf/route.ts",{
  "next/server":{NextResponse:Response},
  "@/lib/server/clientNdaAccess":{getAdminSupabase:()=>admin},
  "@/lib/server/dailyRegistrationProgramPdf":{renderRegistrationProgramPdf:()=>new Uint8Array([37,80,68,70,45])}
 },{Response,fetch:()=>assert.fail("Network forbidden")});
 return {get:()=>GET(null,{params:Promise.resolve({token:"portal-secret"})}),calls};
}
test("active learner receives genuine PDF without public registration",async()=>{
 const h=setup();const r=await h.get();assert.equal(r.status,200);assert.equal(r.headers.get("Content-Type"),"application/pdf");
 assert.equal(Buffer.from(await r.arrayBuffer()).toString(),"%PDF-");assert.ok(h.calls.includes("daily_formations"));
});
for(const [name,opts,code] of [
 ["trainer",{role:"trainer"},404],["revoked",{status:"revoked"},403],
 ["expired",{expiresAt:"2000-01-01"},403],["cancelled",{enrolmentStatus:"cancelled"},403],
 ["draft",{formationStatus:"draft"},404],["imported",{creationMode:"program_import"},404]
])test("private PDF refuses "+name,async()=>{
 const h=setup(opts);const r=await h.get();assert.equal(r.status,code);
 if(["trainer","revoked","expired","cancelled"].includes(name))assert.ok(!h.calls.includes("daily_formations"));
});
