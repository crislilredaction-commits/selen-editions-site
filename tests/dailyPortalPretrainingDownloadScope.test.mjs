import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";
import { isValidPortalExpiry } from "../lib/daily/portalAttendanceAccess.mjs";

function setup(kind, options = {}) {
 const role = options.role ?? "learner";
 const email = role === "trainer" ? "trainer@test.invalid" : role === "enterprise" ? "company@test.invalid" : "learner@test.invalid";
 const path = options.path ?? "daily/org/document.pdf";
 const rows = {
  daily_portal_access_tokens: [{ token: "secret", session_id: "session", portal_type: role, entity_email: email, status: options.status ?? "pending", expires_at: options.expiresAt === undefined ? null : options.expiresAt }],
  daily_sessions: [{ id: "session", organisation_id: "org", status: options.archived ? "archived" : "active", companies: [{ name: "Company", email: "company@test.invalid" }] }],
  daily_session_enrolments: [{ session_id: "session", learner_id: "learner", status: "active", daily_learners: { email } }],
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
  "next/server": { NextResponse: { json: Response.json, redirect: (url,init) => new Response(null,{ status:302, headers:{ location:String(url), ...(init?.headers ?? {}) } }) } },
  "@/lib/server/clientNdaAccess": { getAdminSupabase: () => db },
  "@/lib/server/dailyPersonalAttendance": { personalSignatureStorageObjectPath: (value,org) => {
   const p=String(value ?? ""); return p.startsWith(`daily/${org}/`) && !p.split("/").some(part => !part || part === "." || part === "..") ? p : null;
  } },
  "@/lib/server/dailyPortalLearnerIdentity": { matchesDailyLearnerPortalAccess: () => true, hasUniqueDailyLearnerRecipientEmail: () => true },
  "@/lib/daily/enterprisePortalIdentity.mjs": { resolveEnterprisePortalCompany: () => ({ status: options.companyStatus ?? "ok", company: { name: "Company" } }) },
  "@/lib/daily/portalAttendanceAccess.mjs": { isValidPortalExpiry },
 }, { Response });
 return { get: () => GET(new Request(`https://selen.test.invalid/api/daily-portal/secret/${kind}?id=doc`), { params: Promise.resolve({ token: "secret" }) }), signed: () => signed };
}

for (const kind of ["convention","convocation"]) {
 for (const [label,opts,expected] of [
  ["valid learner",{},302],["valid enterprise",{role:"enterprise"},302],
  ["valid future expiry",{expiresAt:"2030-01-01T00:00:00.000Z"},302],
  ["expired expiry",{expiresAt:"2026-10-01T00:00:00.000Z"},404],
  ["malformed expiry",{expiresAt:"not-a-date"},404],
  ["blank expiry",{expiresAt:" "},404],
  ["numeric expiry",{expiresAt:42},404],
  ["numeric future year string",{expiresAt:"9999"},404],
  ["ambiguous numeric year string",{expiresAt:"2030"},404],
  ["non-ISO future date",{expiresAt:"12/31/9999"},404],
  ["impossible ISO date",{expiresAt:"2030-02-30T00:00:00Z"},404],
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

for (const kind of ["convention", "convocation"]) {
  test(`${kind}: invalid expiry is rejected before reading session or signing storage`, async () => {
    const h = setup(kind, { expiresAt: "broken" });
    const response = await h.get();
    assert.equal(response.status, 404);
    assert.equal(h.signed(), 0);
  });
}
