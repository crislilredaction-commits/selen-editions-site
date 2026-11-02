import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const payload = Buffer.from("CERTIFICAT DE TEST - AUCUNE DONNEE REELLE");
const expectedHash = createHash("sha256").update(payload).digest("hex");
const secret = "PRIVATE_SQL_INTERNAL_DETAILS";

function fixture({ of = "of-a", denied = false, fail = "", tamper = false,
  empty = false, hash = expectedHash, wrongLink = false, wrongMetadata = false,
  foreign = false, sessionStatus = "completed", storageThrow = false } = {}) {
  const reads = [], writes = [], deliveries = [], downloads = [];
  const document = {
    id: "document-a", organisation_id: foreign ? "of-b" : of,
    document_type: "completion_certificate", linked_object_type: "enrolment",
    linked_object_id: "enrolment-a", session_id: wrongLink ? "session-b" : "session-a",
    enrolment_id: "enrolment-a", learner_id: "learner-a", version: 2,
    status: "published", logical_name: "certificat-realisation",
    bucket: "documents", storage_path: "daily/of-a/enrolment-a/certificate.doc",
    sha256: hash, is_current: true,
    metadata: { session_id: wrongMetadata ? "session-b" : "session-a",
      enrolment_id: "enrolment-a", learner_id: "learner-a" },
  };
  const rows = {
    daily_documents: document,
    daily_session_enrolments: {
      id: "enrolment-a", session_id: "session-a", learner_id: "learner-a",
      status: "completed", daily_learners: { first_name: "Test", last_name: "Fictif",
        email: "fictif@example.test" },
    },
    daily_communications: null,
    daily_sessions: { id: "session-a", start_date: "2026-10-01",
      end_date: "2026-10-02", status: sessionStatus,
      daily_formations: { title: "Formation fictive" } },
  };
  const admin = {
    from(table) {
      let operation = "read", value;
      const filters = [];
      const q = {
        select() { return q; },
        eq(key, item) { filters.push(["eq", key, item]); return q; },
        contains(key, item) { filters.push(["contains", key, item]); return q; },
        order() { return q; },
        limit() { return q; },
        insert(item) { operation = "insert"; value = item; return q; },
        update(item) { operation = "update"; value = item; return q; },
        result() {
          if (operation === "read") reads.push({ table, filters: [...filters] });
          else writes.push({ table, operation, value, filters: [...filters] });
          const error = fail === table + ":" + operation ? { message: secret } : null;
          let data = operation === "read" ? rows[table] ?? null
            : operation === "insert" ? { id: "communication-a" } : null;
          if (table === "daily_documents" && data && filters.some(
            ([kind, key, item]) => kind === "eq" && key === "organisation_id"
              && item !== data.organisation_id)) data = null;
          return { data, error };
        },
        maybeSingle() { return Promise.resolve(q.result()); },
        single() { return Promise.resolve(q.result()); },
        then(resolve, reject) { return Promise.resolve(q.result()).then(resolve, reject); },
      };
      return q;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "documents");
        return {
          async download(path) {
            downloads.push(path);
            if (storageThrow) throw new Error(secret);
            const bytes = empty ? Buffer.alloc(0) : tamper ? Buffer.from("ALTERED") : payload;
            return { data: { arrayBuffer: async () => Uint8Array.from(bytes).buffer }, error: null };
          },
        };
      },
    },
  };
  const context = denied ? { ok: false, status: 403, error: "Accès refusé." }
    : { ok: true, organisationId: of, user: { id: "of-user" }, assisted: false, admin };
  const route = loadTypeScript("app/api/client/daily/posttraining-documents/send/route.ts", {
    "node:buffer": { Buffer },
    "node:crypto": { createHash },
    "next/server": { NextResponse: { json: (body, init = {}) => ({
      status: init.status ?? 200, body, headers: init.headers ?? {},
    }) } },
    "@/lib/server/dailyOrganisationContext": {
      getDailyOrganisationContext: async () => context,
    },
    "@/lib/server/dailyPosttrainingEmails": {
      prepareDailyCompletionCertificateEmail: () => ({ subject: "Test", text: "Test", html: "<p>Test</p>" }),
      sendDailyCompletionCertificate: async (input) => {
        deliveries.push(input);
        return { sent: true, message: { providerMessageId: "fake-provider-id" } };
      },
    },
  }, { Date, console });
  return { post: () => route.POST({ json: async () => ({ document_id: "document-a" }) }),
    reads, writes, deliveries, downloads, of };
}

test("P0-05: published certificate with matching bytes and identities is sent once", async () => {
  const f = fixture();
  const r = await f.post();
  assert.equal(r.status, 200);
  assert.equal(r.headers["Cache-Control"], "private, no-store");
  assert.equal(f.deliveries.length, 1);
  assert.equal(f.deliveries[0].attachmentBase64, payload.toString("base64"));
  assert.equal(f.writes.filter(x => x.table === "daily_communications" && x.operation === "insert").length, 1);
  assert.equal(f.writes.filter(x => x.table === "daily_communication_documents").length, 1);
  for (const read of f.reads) {
    assert.ok(read.filters.some(([kind, key, value]) =>
      kind === "eq" && key === "organisation_id" && value === f.of),
      "Missing OF scope on " + read.table);
  }
});

for (const options of [
  { tamper: true }, { empty: true }, { hash: "invalid-hash" },
  { wrongLink: true }, { wrongMetadata: true }, { foreign: true },
  { storageThrow: true }, { sessionStatus: "cancelled" },
]) {
  test("P0-05: rejects invalid certificate without email or communication proof " + JSON.stringify(options), async () => {
    const f = fixture(options);
    const r = await f.post();
    assert.ok([404, 409, 503].includes(r.status), "Unexpected HTTP " + r.status);
    assert.equal(r.headers["Cache-Control"], "private, no-store");
    assert.equal(f.deliveries.length, 0);
    assert.equal(f.writes.length, 0);
    assert.doesNotMatch(JSON.stringify(r.body), /PRIVATE_SQL_INTERNAL_DETAILS/);
  });
}

for (const table of ["daily_documents", "daily_session_enrolments",
  "daily_communications", "daily_sessions"]) {
  test("P0-05: " + table + " SQL failure never sends or leaks SQL", async () => {
    const f = fixture({ fail: table + ":read" });
    const r = await f.post();
    assert.equal(r.status, 503);
    assert.equal(r.headers["Cache-Control"], "private, no-store");
    assert.equal(f.deliveries.length, 0);
    assert.equal(f.writes.length, 0);
    assert.doesNotMatch(JSON.stringify(r.body), /PRIVATE_SQL_INTERNAL_DETAILS/);
  });
}

test("P0-05: unauthorized OF cannot read, sign or send certificates", async () => {
  const f = fixture({ denied: true });
  const r = await f.post();
  assert.equal(r.status, 403);
  assert.equal(f.reads.length, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.downloads.length, 0);
  assert.equal(f.deliveries.length, 0);
});
