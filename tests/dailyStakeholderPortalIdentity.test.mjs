import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const identity = loadTypeScript("lib/server/dailyPortalLearnerIdentity.ts");
const active = { id: "enrol-a", learner_id: "learner-a", status: "active", session_id: "session", organisation_id: "org", daily_learners: { id: "learner-a", email: "shared@example.test" } };
const cancelled = { id: "enrol-b", learner_id: "learner-b", status: "cancelled", session_id: "session", organisation_id: "org", daily_learners: { id: "learner-b", email: "shared@example.test" } };

function setup({ role = "learner", key = "", email = "shared@example.test", status = "pending", enrolments = [active, cancelled], sessionStatus = "ready" } = {}) {
  const reads = [], writes = [];
  const db = {
    daily_portal_access_tokens: [{ id: "token-id", token: "secret", user_id: "owner", session_id: "session", portal_type: role, entity_key: key, entity_name: "Alice", entity_email: email, status, expires_at: null }],
    daily_sessions: [{ id: "session", organisation_id: "org", status: sessionStatus }],
    daily_session_enrolments: enrolments,
    daily_stakeholder_feedback: [],
  };
  const admin = {
    from(table) {
      reads.push(table);
      const filters = [];
      let insertion = null;
      const q = {
        select() { return q; },
        eq(k, v) { filters.push(row => row[k] === v); return q; },
        neq(k, v) { filters.push(row => row[k] !== v); return q; },
        insert(row) { insertion = row; return q; },
        maybeSingle() {
          return Promise.resolve({ data: (db[table] ?? []).filter(row => filters.every(fn => fn(row)))[0] ?? null, error: null });
        },
        single() {
          if (insertion) {
            writes.push({ table, row: insertion });
            return Promise.resolve({ data: { id: "feedback-id", created_at: "2026-10-29T00:00:00Z", status: "received" }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      if (table === "daily_session_enrolments") {
        q.then = (resolve, reject) => Promise.resolve({
          data: (db[table] ?? []).filter(row => filters.every(fn => fn(row))), error: null,
        }).then(resolve, reject);
      }
      return q;
    },
  };
  const route = loadTypeScript("app/api/daily-stakeholder-feedback/[token]/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
    "@/lib/server/dailyPortalLearnerIdentity": identity,
  }, { Response });
  const args = { params: Promise.resolve({ token: "secret" }) };
  const get = () => route.GET(new Request("https://selen.example.test/api/daily-stakeholder-feedback/secret"), args);
  const post = () => route.POST(new Request("https://selen.example.test/api/daily-stakeholder-feedback/secret", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ submissionType: "complaint", subject: "Question", message: "Merci de vérifier ce point." }),
  }), args);
  return { get, post, reads, writes };
}

for (const method of ["get", "post"]) {
  test(method + " refuses legacy shared email even when second enrolment is cancelled", async () => {
    const h = setup();
    assert.equal((await h[method]()).status, 409);
    assert.equal(h.writes.length, 0);
  });
  test(method + " accepts canonical learner identity despite shared email", async () => {
    const h = setup({ key: "learner:learner-a" });
    assert.equal((await h[method]()).status, 200);
    if (method === "post") assert.equal(h.writes[0].row.enrolment_id, "enrol-a");
  });
  test(method + " rejects cancelled canonical learner", async () => {
    const h = setup({ key: "learner:learner-b" });
    assert.equal((await h[method]()).status, 403);
    assert.equal(h.writes.length, 0);
  });
  test(method + " accepts a unique legacy learner", async () => {
    const h = setup({ enrolments: [active] });
    assert.equal((await h[method]()).status, 200);
    if (method === "post") assert.equal(h.writes[0].row.enrolment_id, "enrol-a");
  });
  test(method + " denies revoked and unknown portal tokens before reading session data", async () => {
    for (const status of ["revoked", "unknown"]) {
      const h = setup({ status });
      assert.equal((await h[method]()).status, 403);
      assert.deepEqual(h.reads, ["daily_portal_access_tokens", "daily_sessions"]);
      assert.equal(h.writes.length, 0);
    }
  });
  test(method + " denies unsupported portal roles", async () => {
    const h = setup({ role: "admin" });
    assert.equal((await h[method]()).status, 403);
    assert.equal(h.writes.length, 0);
  });
  test(method + " cannot match learner enrolment from another organisation", async () => {
    const h = setup({ enrolments: [{ ...active, organisation_id: "other-org" }] });
    assert.equal((await h[method]()).status, 409);
    assert.equal(h.writes.length, 0);
  });
}
for (const role of ["trainer", "enterprise"]) {
  test("valid " + role + " feedback is not linked to a learner enrolment", async () => {
    const h = setup({ role });
    assert.equal((await h.post()).status, 200);
    assert.equal(h.writes[0].row.enrolment_id, null);
    assert.equal(h.writes[0].row.stakeholder_type, role === "enterprise" ? "company" : "trainer");
  });
}
