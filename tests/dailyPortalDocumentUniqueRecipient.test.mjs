import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const learnerIdentity = loadTypeScript("lib/server/dailyPortalLearnerIdentity.ts");
const active = { id:"enrol-a", learner_id:"learner-a", status:"active", session_id:"session", organisation_id:"org", daily_learners:{id:"learner-a",email:"shared@example.test"} };
const cancelled = { id:"enrol-b", learner_id:"learner-b", status:"cancelled", session_id:"session", organisation_id:"org", daily_learners:{id:"learner-b",email:"shared@example.test"} };

function setup({ entityKey="", accessStatus="pending", portalType="learner", enrolments=[active,cancelled] }={}) {
  const db={
    daily_portal_access_tokens:[{id:"access",token:"secret",session_id:"session",portal_type:portalType,entity_key:entityKey,entity_email:"shared@example.test",status:accessStatus,expires_at:null}],
    daily_sessions:[{id:"session",organisation_id:"org",status:"ready",end_date:null,companies:[]}],
    daily_documents:[{id:"document",organisation_id:"org",document_type:"learner_file",linked_object_type:"enrolment",linked_object_id:"enrol-a",session_id:"session",enrolment_id:"enrol-a",learner_id:"learner-a",status:"published",is_current:true,archived_at:null,bucket:"documents",storage_path:"daily/org/private.pdf",metadata:{}}],
    daily_session_enrolments:enrolments,
  };
  const reads=[];let signedCount=0;
  const admin={
    from(table){
      reads.push(table);
      const filters=[];let single=false;
      const q={
        select(){return q;},
        eq(k,v){filters.push(row=>row[k]===v);return q;},
        neq(k,v){filters.push(row=>row[k]!==v);return q;},
        is(k,v){filters.push(row=>row[k]===v);return q;},
        in(k,values){filters.push(row=>values.includes(row[k]));return q;},
        maybeSingle(){single=true;return q;},
        then(resolve,reject){return Promise.resolve().then(()=>{
          const rows=(db[table]??[]).filter(row=>filters.every(check=>check(row)));
          return {data:single?(rows[0]??null):rows,error:null};
        }).then(resolve,reject);}
      };return q;
    },
    storage:{from(bucket){
      assert.equal(bucket,"documents");
      return {async createSignedUrl(path,ttl){
        assert.equal(path,"daily/org/private.pdf");assert.equal(ttl,120);
        signedCount++;return {data:{signedUrl:"https://files.example.test/private.pdf"},error:null};
      }};
    }}
  };
  const {GET}=loadTypeScript("app/api/daily-portal/[token]/document/route.ts",{
    "next/server":{NextResponse:Response},
    "@/lib/server/clientNdaAccess":{getAdminSupabase:()=>admin},
    "@/lib/server/dailyPortalResourceVisibility":{
      DAILY_PORTAL_RESOURCE_STATUSES:["published"],
      DAILY_PORTAL_RESOURCE_TYPES:["learner_file"],
      isDailyPortalResourceVisible:({enrolmentIds,learnerIds})=>enrolmentIds.includes("enrol-a")&&learnerIds.includes("learner-a")
    },
    "@/lib/server/dailyPersonalAttendance":{isPostsessionDownloadAvailable:()=>true,personalAttendanceEnrolmentId:()=>null},
    "@/lib/server/dailyPersonalAssessment":{personalAssessmentEvidenceSourceId:()=>null,personalAssessmentResultEnrolmentId:()=>null},
    "@/lib/server/dailyPortalLearnerIdentity":learnerIdentity,
    "@/lib/daily/enterprisePortalIdentity.mjs":{resolveEnterprisePortalCompany:()=>({status:"missing"})},
  },{Response});
  return {get:()=>GET(new Request("https://selen.example.test/api/daily-portal/secret/document?id=document"),{params:Promise.resolve({token:"secret"})}),reads,getSignedCount:()=>signedCount};
}

test("legacy email-only link rejects collision with cancelled enrolment before signing",async()=>{
  const h=setup();const response=await h.get();
  assert.equal(response.status,409);
  assert.equal(h.getSignedCount(),0);
  assert.ok(h.reads.includes("daily_session_enrolments"));
});
test("canonical learner identity remains usable when another enrolment shares email",async()=>{
  const h=setup({entityKey:"learner:learner-a"});const response=await h.get();
  assert.equal(response.status,302);
  assert.equal(new URL(response.headers.get("location")).hostname,"files.example.test");
  assert.equal(h.getSignedCount(),1);
});
test("unique legacy email remains usable",async()=>{
  const h=setup({enrolments:[active]});const response=await h.get();
  assert.equal(response.status,302);
  assert.equal(h.getSignedCount(),1);
});
test("cancelled canonical enrolment is refused without signing",async()=>{
  const h=setup({entityKey:"learner:learner-b"});const response=await h.get();
  assert.equal(response.status,403);
  assert.equal(h.getSignedCount(),0);
});
test("unknown access status is denied before private data reads",async()=>{
  const h=setup({entityKey:"learner:learner-a",accessStatus:"unknown"});const response=await h.get();
  assert.equal(response.status,403);
  assert.equal(h.getSignedCount(),0);
  assert.deepEqual(h.reads,["daily_portal_access_tokens"]);
});
test("unknown portal type is denied before private data reads",async()=>{
  const h=setup({portalType:"invalid"});const response=await h.get();
  assert.equal(response.status,404);
  assert.equal(h.getSignedCount(),0);
  assert.deepEqual(h.reads,["daily_portal_access_tokens"]);
});
test("two active enrolments with same legacy email are ambiguous",async()=>{
  const h=setup({enrolments:[active,{...cancelled,status:"active"}]});const response=await h.get();
  assert.equal(response.status,409);assert.equal(h.getSignedCount(),0);
});
