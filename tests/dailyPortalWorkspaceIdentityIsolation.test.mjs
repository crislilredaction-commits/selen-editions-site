import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";
const identity = loadTypeScript("lib/server/dailyPortalLearnerIdentity.ts");
const active = {id:"enrol-a",learner_id:"learner-a",status:"active",session_id:"session",organisation_id:"org",daily_learners:{id:"learner-a",email:"shared@example.test",first_name:"Alice"}};
const cancelled = {id:"enrol-b",learner_id:"learner-b",status:"cancelled",session_id:"session",organisation_id:"org",daily_learners:{id:"learner-b",email:"shared@example.test",first_name:"Bob"}};
function setup({entityKey="",status="pending",expiresAt=null,enrolments=[active,cancelled]}={}){
 const reads=[],writes=[];
 const db={
  daily_portal_access_tokens:[{id:"access",token:"secret",session_id:"session",portal_type:"learner",user_id:"owner",entity_key:entityKey,entity_name:"Alice",entity_email:"shared@example.test",status,expires_at:expiresAt}],
  daily_sessions:[{id:"session",organisation_id:"org",status:"ready",formation_id:null,end_date:null,companies:[],beneficiaries:[],individual_beneficiaries:[],daily_formations:{title:"Formation test"}}],
  daily_session_enrolments:enrolments,daily_documents:[],daily_onboarding:[],daily_registration_responses:[],daily_conventions:[],daily_trainers:[],daily_convocations:[]
 };
 const admin={from(table){reads.push(table);const filters=[];let single=false,patch=null;
  const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},is(k,v){filters.push(r=>r[k]===v);return q},in(k,vs){filters.push(r=>vs.includes(r[k]));return q},order(){return q},maybeSingle(){single=true;return q},update(p){patch=p;return q},then(resolve,reject){return Promise.resolve().then(()=>{const rows=(db[table]??[]).filter(r=>filters.every(fn=>fn(r)));if(patch){writes.push({table,patch});for(const row of rows)Object.assign(row,patch)}return {data:single?rows[0]??null:rows,error:null}}).then(resolve,reject)}};return q;
 }};
 const common={
  "next/server":{NextResponse:Response},
  "@/lib/server/clientNdaAccess":{getAdminSupabase:()=>admin},
  "@/lib/server/dailyPortalLearnerIdentity":identity,
  "@/lib/server/dailyPortalResourceVisibility":{DAILY_PORTAL_RESOURCE_STATUSES:["published"],DAILY_PORTAL_RESOURCE_TYPES:["organisation_shared"],isDailyPortalResourceVisible:()=>false},
  "@/lib/server/dailyPersonalAttendance":{isPostsessionDownloadAvailable:()=>false,attendanceIsSettled:()=>false,personalAttendanceDocumentId:id=>id},
  "@/lib/server/dailyPersonalAssessment":{isFinalAssessmentResult:()=>false,personalAssessmentEvidenceDocumentId:id=>id,personalAssessmentResultDocumentId:id=>id},
  "@/lib/daily/enterprisePortalIdentity.mjs":{resolveEnterprisePortalCompany:()=>({status:"missing"}),matchesEnterprisePortalRecipient:()=>false}
 };
 const root=loadTypeScript("app/api/daily-portal/[token]/route.ts",{...common,"@/lib/daily/ownPositioning":{positioningSourceDocumentId:()=>null}},{Response});
 const resources=loadTypeScript("app/api/daily-portal/[token]/resources/route.ts",common,{Response});
 const request=new Request("https://selen.example.test/api/daily-portal/secret"),args={params:Promise.resolve({token:"secret"})};
 return {root:()=>root.GET(request,args),resources:()=>resources.GET(request,args),reads,writes};
}
for(const route of ["root","resources"]){
 test(route+" refuses legacy shared email when another enrolment is cancelled",async()=>{
  const h=setup();assert.equal((await h[route]()).status,409);assert.equal(h.writes.length,0);
 });
 test(route+" accepts canonical key despite cancelled shared-email enrolment",async()=>{
  const h=setup({entityKey:"learner:learner-a"}),response=await h[route]();assert.equal(response.status,200);
  if(route==="root")assert.equal((await response.json()).enrolment.id,"enrol-a");
 });
 test(route+" accepts unique legacy email",async()=>{assert.equal((await setup({enrolments:[active]})[route]()).status,200)});
 test(route+" denies cancelled canonical enrolment",async()=>{assert.equal((await setup({entityKey:"learner:learner-b"})[route]()).status,403)});
 test(route+" denies unknown token status before reading private data",async()=>{
  const h=setup({entityKey:"learner:learner-a",status:"unknown"});assert.equal((await h[route]()).status,403);assert.deepEqual(h.reads,["daily_portal_access_tokens"]);
 });
}

for(const route of ["root","resources"]){
 test(route+" refuses corrupt or expired portal links before any session or document read",async()=>{
  for(const expiresAt of ["2020-01-01T00:00:00.000Z","not-a-date","", " ",42]){
   const h=setup({entityKey:"learner:learner-a",expiresAt});
   const response=await h[route]();
   assert.equal(response.status,410,`route=${route} expiresAt=${String(expiresAt)}`);
   assert.ok(h.reads.length>=1);
   assert.ok(h.reads.every(table=>table==="daily_portal_access_tokens"),"no private reads on invalid expiry");
  }
 });
 test(route+" accepts a valid future deadline",async()=>{
  const h=setup({entityKey:"learner:learner-a",expiresAt:"2099-01-01T00:00:00.000Z"});
  assert.equal((await h[route]()).status,200);
 });
}
