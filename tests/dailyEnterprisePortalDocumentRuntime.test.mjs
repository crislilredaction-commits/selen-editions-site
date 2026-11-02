import test from "node:test";
import assert from "node:assert/strict";
import {loadTypeScript} from "./helpers/loadTypeScript.mjs";
import {isActivePortalAttendanceToken} from "../lib/daily/portalAttendanceAccess.mjs";
function setup({failTable="",signError=false,documentOrg="of-A",companyStatus="ok",status="pending"}={}){
 const access={id:"access",token:"secret",session_id:"session",portal_type:"enterprise",entity_email:"a@example.test",status,expires_at:null};
 const session={id:"session",organisation_id:"of-A",companies:[{name:"A",email:"a@example.test"},{name:"B",email:"b@example.test"}],status:"active",end_date:null};
 const document={id:"doc",organisation_id:documentOrg,document_type:"company_document",linked_object_type:"session",linked_object_id:"session",session_id:"session",status:"published",is_current:true,archived_at:null,bucket:"documents",storage_path:"daily/of-A/doc.pdf",metadata:{}};
 const rows={daily_portal_access_tokens:[access],daily_sessions:[session],daily_documents:[document]};let signed=0;const reads=[];
 const admin={from(table){reads.push(table);const filters=[];let single=false;const q={
  select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},is(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},maybeSingle(){single=true;return q},
  then(ok,bad){return Promise.resolve().then(()=>{if(table===failTable)return{data:null,error:{message:"internal SQL secret"}};const found=(rows[table]??[]).filter(r=>filters.every(f=>f(r)));return{data:single?found[0]??null:found,error:null}}).then(ok,bad)}
 };return q},storage:{from(bucket){assert.equal(bucket,"documents");return{async createSignedUrl(path,ttl){signed++;assert.equal(path,"daily/of-A/doc.pdf");assert.equal(ttl,120);return signError?{data:null,error:{message:"internal storage secret"}}:{data:{signedUrl:"https://files.example.test/doc.pdf"},error:null}}}}}};
 const {GET}=loadTypeScript("app/api/daily-portal/[token]/document/route.ts",{
  "next/server":{NextResponse:{json:(body,init)=>Response.json(body,init),redirect:(url,init)=>new Response(null,{status:302,headers:{location:String(url),...(init?.headers??{})}})}},
  "@/lib/server/clientNdaAccess":{getAdminSupabase:()=>admin},
  "@/lib/server/dailyPortalResourceVisibility":{DAILY_PORTAL_RESOURCE_STATUSES:["published"],DAILY_PORTAL_RESOURCE_TYPES:["company_document"],isDailyPortalResourceVisible:({resource,companyName,role,sessionId})=>resource.organisation_id==="of-A"&&companyName==="A"&&role==="enterprise"&&sessionId==="session"},
  "@/lib/server/dailyPersonalAttendance":{isPostsessionDownloadAvailable:()=>true,personalAttendanceEnrolmentId:()=>null,personalSignatureStorageObjectPath:(path,org)=>path.startsWith("daily/"+org+"/")?path:null},
  "@/lib/server/dailyPersonalAssessment":{personalAssessmentEvidenceSourceId:()=>null,personalAssessmentResultEnrolmentId:()=>null},
  "@/lib/server/dailyPortalLearnerIdentity":{matchesDailyLearnerPortalAccess:()=>false},
  "@/lib/daily/enterprisePortalIdentity.mjs":{resolveEnterprisePortalCompany:(companies,email)=>companyStatus==="ok"?{status:"ok",company:companies.find(c=>c.email===email)}:{status:companyStatus,company:null}},
  "@/lib/daily/portalAttendanceAccess.mjs":{isActivePortalAttendanceToken},
 },{Response,URL});
 return{get:()=>GET(new Request("https://selen.example.test/api/daily-portal/secret/document?id=doc"),{params:Promise.resolve({token:"secret"})}),signed:()=>signed,reads};
}
test("P0-09 entreprise: document privé URL 120 s",async()=>{const h=setup(),r=await h.get();assert.equal(r.status,302);assert.equal(h.signed(),1);assert.equal(r.headers.get("cache-control"),"private, no-store")});
for(const table of ["daily_portal_access_tokens","daily_sessions","daily_documents"])test("P0-09 entreprise: panne SQL "+table,async()=>{const h=setup({failTable:table}),r=await h.get();assert.equal(r.status,503);assert.equal(r.headers.get("cache-control"),"private, no-store");assert.doesNotMatch(JSON.stringify(await r.json()),/SQL|internal/i);assert.equal(h.signed(),0)});
test("P0-09 entreprise: panne stockage",async()=>{const h=setup({signError:true}),r=await h.get();assert.equal(r.status,503);assert.equal(r.headers.get("cache-control"),"private, no-store");assert.doesNotMatch(JSON.stringify(await r.json()),/storage|internal/i)});
test("P0-09 entreprise: document OF B refusé",async()=>{const h=setup({documentOrg:"of-B"}),r=await h.get();assert.equal(r.status,404);assert.equal(h.signed(),0)});
for(const v of ["missing","ambiguous"])test("P0-09 entreprise: identité "+v,async()=>{const h=setup({companyStatus:v}),r=await h.get();assert.equal(r.status,v==="ambiguous"?409:403);assert.equal(h.signed(),0)});
test("P0-09 entreprise: lien révoqué",async()=>{const h=setup({status:"revoked"}),r=await h.get();assert.equal(r.status,403);assert.equal(h.signed(),0);assert.deepEqual(h.reads,["daily_portal_access_tokens"])});
