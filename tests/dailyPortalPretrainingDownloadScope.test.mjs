import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

function setup(kind, options = {}) {
 const role = options.role ?? "learner";
 const email = role === "trainer" ? "trainer@test.invalid" : role === "enterprise" ? "company@test.invalid" : "learner@test.invalid";
 const path = options.path ?? "daily/org/document.pdf";
 const rows = {
  daily_portal_access_tokens: [{ token: "secret", session_id: "session", portal_type: role, entity_email: email, status: options.status ?? "pending", expires_at: null }],
  daily_sessions: [{ id: "session", organisation_id: "org", status: options.archived ? "archived" : "active", companies: [{ name: "Company", email: "company@test.invalid" }] }],
  daily_session_enrolments: [{ learner_id: "learner", status: "active", daily_learners: { email } }],
  daily_conventions: [{ id: "doc", session_id: "session", recipient_type: role === "enterprise" ? "company" : "beneficiary", recipient_email: email, storage_path: path, document_name: "doc.pdf" }],
  daily_convocations: [{ id: "doc", session_id: "session", recipient_type: role === "enterprise" ? "company" : role === "trainer" ? "trainer" : "beneficiary", recipient_email: email, storage_path: path, document_name: "doc.pdf", status: "sent" }],
 };
 let signed = 0;
 const db = { from(table) {
  const filters = []; let single = false; let patch;
  const q = {
   select() { return q; },
   eq(k,v) { filters.push(r => r[k] === v); return q; },
   neq(k,v) { filters.push(r => r[k] !== v); return q; },
   maybeSingle() { single = true; return q; },
   update(v) { patch = v; return q; },
   then(ok,fail) { return Promise.resolve().then(() => {
    if (table === "daily_sessions" && options.sqlError) return { data: null, error: { message: "SQL failure" } };
    const result = (rows[table] ?? []).filter(r => filters.every(f => f(r)));
    if (patch) for (const r of result) Object.assign(r,patch);
    return { data: single ? result[0] ?? null : result, error: null };
   }).then(ok,fail); }
  }; return q;
 }, storage: { from(bucket) { assert.equal(bucket,"documents"); return { async createSignedUrl(objectPath,ttl) {
  assert.equal(objectPath,path); assert.equal(ttl,300); signed++;
  return { data: { signedUrl: "https://files.test.invalid/document.pdf" }, error: null };
 } }; } } };
 const { GET } = loadTypeScript(`app/api/daily-portal/[token]/${kind}/route.ts`, {
  "next/server": { NextResponse: Response },
  "@/lib/server/clientNdaAccess": { getAdminSupabase: () => db },
  "@/lib/server/dailyPersonalAttendance": { personalSignatureStorageObjectPath: (value,org) => {
   const p=String(value ?? ""); return p.startsWith(`daily/${org}/`) && !p.split("/").some(part => !part || part === "." || part === "..") ? p : null;
  } },
  "@/lib/server/dailyPortalLearnerIdentity": { matchesDailyLearnerPortalAccess: () => true, hasUniqueDailyLearnerRecipientEmail: () => true },
  "@/lib/daily/enterprisePortalIdentity.mjs": { resolveEnterprisePortalCompany: () => ({ status: options.companyStatus ?? "ok", company: { name: "Company" } }) },
 }, { Response });
 return { get: () => GET(new Request(`https://selen.test.invalid/api/daily-portal/secret/${kind}?id=doc`), { params: Promise.resolve({ token: "secret" }) }), signed: () => signed };
}

for (const kind of ["convention","convocation"]) {
 for (const [label,opts,expected] of [
  ["valid learner",{},302],["valid enterprise",{role:"enterprise"},302],
  ["revoked",{status:"revoked"},403],["unknown token state",{status:"disabled"},403],
  ["archived session",{archived:true},404],["SQL error",{sqlError:true},500],
  ["cross-OF path",{path:"daily/other/private.pdf"},404],
  ["traversal",{path:"daily/org/../other/private.pdf"},404],
  ["ambiguous company",{role:"enterprise",companyStatus:"ambiguous"},409],
 ]) test(`${kind}: ${label}`,async () => {
  const h=setup(kind,opts),r=await h.get(); assert.equal(r.status,expected);
  assert.equal(h.signed(),expected===302?1:0);
  if(expected===302)assert.equal(r.headers.get("cache-control"),"private, no-store");
 });
}
test("trainer convocation remains accessible",async()=>{
 const h=setup("convocation",{role:"trainer"});assert.equal((await h.get()).status,302);assert.equal(h.signed(),1);
});
test("trainer convention is refused",async()=>{
 const h=setup("convention",{role:"trainer"});assert.equal((await h.get()).status,403);assert.equal(h.signed(),0);
});
