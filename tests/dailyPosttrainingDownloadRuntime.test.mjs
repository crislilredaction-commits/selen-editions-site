import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const secret = "PRIVATE_SQL_INTERNAL_DETAILS";

function fixture({ of = "of-a", denied = false, sqlError = false,
  missing = false, missingPath = false, signingError = false, signingThrow = false } = {}) {
  const reads = [], signed = [];
  const document = { id: "document-a", organisation_id: of,
    document_type: "completion_certificate", bucket: "documents",
    storage_path: missingPath ? "" : "daily/of-a/certificate.doc",
    status: "published", is_current: true, archived_at: null };
  const admin = {
    from(table) {
      const filters = [];
      const q = {
        select() { return q; },
        eq(key, value) { filters.push(["eq", key, value]); return q; },
        in(key, value) { filters.push(["in", key, value]); return q; },
        is(key, value) { filters.push(["is", key, value]); return q; },
        maybeSingle() {
          reads.push({ table, filters: [...filters] });
          const allowed = !missing && filters.every(([kind, key, value]) =>
            kind !== "eq" || document[key] === undefined || document[key] === value);
          return Promise.resolve({ data: allowed ? document : null,
            error: sqlError ? { message: secret } : null });
        },
      };
      return q;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "documents");
        return {
          async createSignedUrl(path, ttl) {
            signed.push({ path, ttl });
            if (signingThrow) throw new Error(secret);
            if (signingError) return { data: null, error: { message: secret } };
            return { data: { signedUrl: "https://storage.example.invalid/fake" }, error: null };
          },
        };
      },
    },
  };
  const context = denied ? { ok: false, status: 403, error: "Accès refusé." }
    : { ok: true, organisationId: of, admin };
  const route = loadTypeScript("app/api/client/daily/posttraining-documents/download/route.ts", {
    "next/server": { NextResponse: {
      json: (body, init = {}) => ({ status: init.status ?? 200, body, headers: init.headers ?? {} }),
      redirect: (url, init = {}) => ({ status: 307, url: String(url), headers: init.headers ?? {} }),
    } },
    "@/lib/server/dailyOrganisationContext": {
      getDailyOrganisationContext: async () => context,
    },
  });
  return { get: (id = "document-a") => route.GET({
    url: "https://selen.example.invalid/api/client/daily/posttraining-documents/download?id=" + id,
  }), reads, signed, of };
}

for (const of of ["of-a", "of-b"]) {
  test("P0-05: published certificate is private and scoped to " + of, async () => {
    const f = fixture({ of });
    const r = await f.get();
    assert.equal(r.status, 307);
    assert.equal(r.headers["Cache-Control"], "private, no-store");
    assert.deepEqual(f.signed, [{ path: "daily/of-a/certificate.doc", ttl: 120 }]);
    assert.ok(f.reads[0].filters.some(([kind, key, value]) =>
      kind === "eq" && key === "organisation_id" && value === of));
    assert.ok(f.reads[0].filters.some(([kind, key, value]) =>
      kind === "eq" && key === "is_current" && value === true));
  });
}

for (const [options, expected] of [
  [{ missing: true }, 404], [{ sqlError: true }, 503],
  [{ missingPath: true }, 503], [{ signingError: true }, 503],
  [{ signingThrow: true }, 503],
]) {
  test("P0-05: download fails closed " + JSON.stringify(options), async () => {
    const f = fixture(options);
    const r = await f.get();
    assert.equal(r.status, expected);
    assert.equal(r.headers["Cache-Control"], "private, no-store");
    assert.doesNotMatch(JSON.stringify(r.body), /PRIVATE_SQL_INTERNAL_DETAILS/);
    if (options.missing || options.sqlError || options.missingPath) {
      assert.equal(f.signed.length, 0);
    }
  });
}

test("P0-05: foreign or absent certificate never yields a signed URL", async () => {
  const f = fixture();
  const r = await f.get("document-foreign");
  assert.equal(r.status, 404);
  assert.equal(f.signed.length, 0);
});

test("P0-05: unauthorized access never reads or signs", async () => {
  const f = fixture({ denied: true });
  const r = await f.get();
  assert.equal(r.status, 403);
  assert.equal(f.reads.length, 0);
  assert.equal(f.signed.length, 0);
});
