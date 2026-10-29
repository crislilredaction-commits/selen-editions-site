import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";
import { isActivePortalAttendanceToken } from "../lib/daily/portalAttendanceAccess.mjs";

const learnerIdentity = loadTypeScript("lib/server/dailyPortalLearnerIdentity.ts");
const pathGuard = loadTypeScript("lib/server/dailyPersonalAttendance.ts");
const active = { id:"enrol-a", learner_id:"learner-a", status:"active", session_id:"session", organisation_id:"org", daily_learners:{id:"learner-a",email:"shared@example.test"} };
const cancelled = { id:"enrol-b", learner_id:"learner-b", status:"cancelled", session_id:"session", organisation_id:"org", daily_learners:{id:"learner-b",email:"shared@example.test"} };

function setup({ entityKey="", accessStatus="pending", portalType="learner", enrolments=[active,cancelled], storagePath="daily/org/private.pdf", expiresAt=null }={}) {
  const db={
    daily_portal_access_tokens:[{id:"access",token:"secret",session_id:"session",portal_type:portalType,entity_key:entityKey,entity_email:"shared@example.test",status:accessStatus,expires_at:expiresAt}],
    daily_sessions:[{id:"session",organisation_id:"org",status:"ready",end_date:null,companies:[]}],
    daily_documents:[{id:"document",organisation_id:"org",document_type:"learner_file",linked_object_type:"enrolment",linked_object_id:"enrol-a",session_id:"session",enrolment_id:"enrol-a",learner_id:"learner-a",status:"published",is_current:true,archived_at:null,bucket:"documents",storage_path:storagePath,metadata:{}}],
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
    "next/server":{NextResponse:{json:(body,init)=>Response.json(body,init),redirect:(url,init)=>new Response(null,{status:302,headers:{location:String(url),...(init?.headers??{})}})}},
    "@/lib/server/clientNdaAccess":{getAdminSupabase:()=>admin},
    "@/lib/server/dailyPortalResourceVisibility":{
      DAILY_PORTAL_RESOURCE_STATUSES:["published"],
      DAILY_PORTAL_RESOURCE_TYPES:["learner_file"],
      isDailyPortalResourceVisible:({enrolmentIds,learnerIds})=>enrolmentIds.includes("enrol-a")&&learnerIds.includes("learner-a")
    },
    "@/lib/server/dailyPersonalAttendance":{isPostsessionDownloadAvailable:()=>true,personalAttendanceEnrolmentId:()=>null,personalSignatureStorageObjectPath:pathGuard.personalSignatureStorageObjectPath},
    "@/lib/server/dailyPersonalAssessment":{personalAssessmentEvidenceSourceId:()=>null,personalAssessmentResultEnrolmentId:()=>null},
    "@/lib/server/dailyPortalLearnerIdentity":learnerIdentity,
    "@/lib/daily/enterprisePortalIdentity.mjs":{resolveEnterprisePortalCompany:()=>({status:"missing"})},
    "@/lib/daily/portalAttendanceAccess.mjs":{isActivePortalAttendanceToken},
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

for (const storagePath of [
  "daily/other/private.pdf",
  "daily/org/../private.pdf",
  "daily/org/./private.pdf",
  "daily/org//private.pdf",
  "daily/org\\private.pdf",
]) {
  test("portal document rejects unsafe Storage path: " + storagePath, async () => {
    const h = setup({entityKey:"learner:learner-a", storagePath});
    const response = await h.get();
    assert.equal(response.status, 404);
    assert.equal(h.getSignedCount(), 0);
  });
}
test("portal document signed download is not cacheable", async () => {
  const h = setup({entityKey:"learner:learner-a"});
  const response = await h.get();
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

for (const [label, expiresAt, expected] of [
  ["legacy link without expiry", null, 302],
  ["valid future expiry", "2030-01-01T00:00:00.000Z", 302],
  ["expired link", "2020-01-01T00:00:00.000Z", 410],
  ["malformed expiry", "not-a-date", 410],
  ["empty expiry", "", 410],
  ["blank expiry", " ", 410],
  ["numeric expiry", 1234, 410],
]) {
  test("portal document: " + label, async () => {
    const h = setup({ entityKey: "learner:learner-a", enrolments: [active], expiresAt });
    const response = await h.get();
    assert.equal(response.status, expected);
    assert.equal(h.getSignedCount(), expected === 302 ? 1 : 0);
    if (expected === 410) assert.deepEqual(h.reads, ["daily_portal_access_tokens"]);
  });
}
