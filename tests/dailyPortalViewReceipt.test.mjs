import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";
import { isValidPortalExpiry } from "../lib/daily/portalAttendanceAccess.mjs";
import { resolveEnterprisePortalCompany, matchesEnterprisePortalRecipient } from "../lib/daily/enterprisePortalIdentity.mjs";

function portal({ role="trainer", pending=true, failRead=null, failWrite=false, ambiguousCompany=false, revokeDuringUpdate=false }={}){
 const calls=[],writes=[];
 const access={id:"access-1",token:"secret",session_id:"session-1",user_id:"owner-1",
  portal_type:role,status:pending?"pending":"viewed",entity_email:"company@example.test",
  entity_name:"Company",viewed_at:null,expires_at:"2099-01-01T00:00:00.000Z"};
 const companies=ambiguousCompany
  ?[{name:"Shared",email:"company@example.test"},{name:"Shared",email:"other@example.test"}]
  :[{name:"Company",email:"company@example.test"}];
 const session={id:"session-1",organisation_id:"of-1",status:"scheduled",formation_id:null,
  companies,beneficiaries:[],individual_beneficiaries:[],daily_formations:null};
 const db={
  daily_portal_access_tokens:[access],daily_sessions:[session],
  daily_session_enrolments:[],daily_onboarding:[],daily_registration_responses:[],
  daily_conventions:[],daily_trainers:[],daily_convocations:[],daily_documents:[]
 };
 const admin={from(table){
  calls.push(table);const filters=[];let patch=null,single=false;
  const q={
   select(){return q},eq(k,v){filters.push(row=>row[k]===v);return q},
   neq(k,v){filters.push(row=>row[k]!==v);return q},
   is(k,v){filters.push(row=>row[k]===v);return q},
   in(k,values){filters.push(row=>values.includes(row[k]));return q},
   order(){return q},maybeSingle(){single=true;return q},
   update(value){patch=value;return q},
   then(resolve,reject){return Promise.resolve().then(()=>{
    if(patch&&revokeDuringUpdate&&table==="daily_portal_access_tokens")access.status="revoked";
    const rows=(db[table]??[]).filter(row=>filters.every(f=>f(row)));
    if(patch){
     if(failWrite)return {data:null,error:{message:"SQL write secret"}};
     for(const row of rows)Object.assign(row,patch);
     writes.push({table,rows:rows.length,patch});
    }
    return {data:single?rows[0]??null:rows,error:!patch&&table===failRead?{message:"SQL read secret"}:null};
   }).then(resolve,reject)}
  };return q;
 }};
 const NextResponse={json:(body,options={})=>({body,status:options.status??200,headers:options.headers??{}})};
 const route=loadTypeScript("app/api/daily-portal/[token]/route.ts",{
  "next/server":{NextResponse},
  "@/lib/server/clientNdaAccess":{getAdminSupabase:()=>admin},
  "@/lib/daily/portalAttendanceAccess.mjs":{isValidPortalExpiry},
  "@/lib/server/dailyPortalResourceVisibility":{DAILY_PORTAL_RESOURCE_STATUSES:[],isDailyPortalResourceVisible:()=>false},
  "@/lib/server/dailyPersonalAttendance":{isPostsessionDownloadAvailable:()=>false},
  "@/lib/daily/ownPositioning":{positioningSourceDocumentId:()=>null},
  "@/lib/server/dailyPortalLearnerIdentity":{matchesDailyLearnerPortalAccess:()=>false,hasUniqueDailyLearnerRecipientEmail:()=>false},
  "@/lib/daily/enterprisePortalIdentity.mjs":{resolveEnterprisePortalCompany,matchesEnterprisePortalRecipient},
 });
 return {run:()=>route.GET(new Request("https://selen.example.test/api/daily-portal/secret"),
  {params:Promise.resolve({token:"secret"})}),access,writes,calls};
}
test("pending portal view is recorded only after successful authorized response",async()=>{
 const h=portal(),response=await h.run();
 assert.equal(response.status,200);
 assert.equal(h.access.status,"viewed");
 assert.equal(h.writes.length,1);
 assert.equal(h.writes[0].rows,1);
 assert.equal(h.writes[0].table,"daily_portal_access_tokens");
 assert.equal(response.body.access.viewedAt,h.access.viewed_at);
 assert.ok(h.access.viewed_at);
 assert.equal(response.headers["Cache-Control"],"private, no-store");
});
test("read failure cannot mark a pending token viewed",async()=>{
 const h=portal({failRead:"daily_onboarding"}),response=await h.run();
 assert.equal(response.status,503);
 assert.equal(h.access.status,"pending");
 assert.equal(h.writes.length,0);
 assert.doesNotMatch(response.body.error,/SQL read secret/);
});
test("ambiguous enterprise identity cannot mark a token viewed",async()=>{
 const h=portal({role:"enterprise",ambiguousCompany:true}),response=await h.run();
 assert.equal(response.status,409);
 assert.equal(h.access.status,"pending");
 assert.equal(h.writes.length,0);
});
test("view tracking SQL failure is private and retryable",async()=>{
 const h=portal({failWrite:true}),response=await h.run();
 assert.equal(response.status,503);
 assert.equal(h.access.status,"pending");
 assert.doesNotMatch(response.body.error,/SQL write secret/);
});
test("concurrent revocation cannot be resurrected by a stale pending read",async()=>{
 const h=portal({revokeDuringUpdate:true}),response=await h.run();
 assert.equal(response.status,409);
 assert.equal(h.access.status,"revoked");
 assert.equal(h.writes[0].rows,0);
});
test("already viewed token does not create a duplicate tracking write",async()=>{
 const h=portal({pending:false}),response=await h.run();
 assert.equal(response.status,200);
 assert.equal(h.writes.length,0);
});
