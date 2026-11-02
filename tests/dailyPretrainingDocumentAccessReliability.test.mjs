import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const sessionA = "11111111-1111-4111-8111-111111111111";
const enrolmentA = "22222222-2222-4222-8222-222222222222";
const sqlSecret = "SQL private schema token: do-not-disclose";

function compile(path, deps) {
  const source = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const exports = {};
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
  } }).outputText;
  vm.runInNewContext(js, {
    exports, URL, Blob, TextEncoder, crypto: globalThis.crypto,
    require(name) {
      assert.ok(Object.hasOwn(deps, name), "Unexpected dependency " + name);
      return deps[name];
    }
  }, { filename: path });
  return exports;
}

function fixture(options = {}) {
  const calls = [], signed = [];
  const admin = {
    from(table) {
      const filters = [];
      const entry = { table, filters, or: null };
      calls.push(entry);
      const q = {
        select() { return q; },
        eq(key, value) { filters.push([key, value]); return q; },
        in(key, value) { filters.push([key, value]); return q; },
        order() { return q; },
        or(value) { entry.or = value; return q; },
        then(resolve, reject) {
          let data = [];
          let error = null;
          if (table === "daily_session_enrolments") {
            data = [{ id: enrolmentA }];
            if (options.enrolmentsFailure) error = { message: sqlSecret };
          } else if (table === "daily_documents") {
            data = [{ id: "document-a", organisation_id: "of-a" }];
            if (options.documentsFailure) error = { message: sqlSecret };
          } else assert.fail("Unexpected table " + table);
          return Promise.resolve({ data: error ? null : data, error }).then(resolve, reject);
        },
        async maybeSingle() {
          assert.equal(table, "daily_documents");
          if (options.documentsFailure) return { data: null, error: { message: sqlSecret } };
          const document = {
            id: "document-a", organisation_id: "of-a", document_type: "convocation",
            bucket: "documents", storage_path: options.missingStoragePath ? "" : "daily/of-a/private.pdf", is_current: true
          };
          const matches = filters.every(([key, value]) =>
            Array.isArray(value) ? value.includes(document[key]) : document[key] === value);
          return { data: matches && !options.missingDocument ? document : null, error: null };
        }
      };
      return q;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "documents");
        return {
          async createSignedUrl(path, seconds) {
            signed.push({ path, seconds });
            if (options.signingThrow) throw new Error(sqlSecret);
            if (options.signingFailure) return { data: null, error: { message: sqlSecret } };
            return { data: { signedUrl: "https://storage.invalid/temporary-token" }, error: null };
          }
        };
      }
    }
  };
  const responses = {
    NextResponse: {
      json(body, init = {}) { return { status: init.status ?? 200, body, headers: init.headers ?? {} }; },
      redirect(url, init = {}) { return { status: 307, url: String(url), headers: init.headers ?? {} }; }
    }
  };
  const context = {
    getDailyOrganisationContext: async () => options.unauthorized
      ? { ok: false, status: 403, error: "Accès refusé" }
      : { ok: true, organisationId: "of-a", admin, user: { id: "user-a" } }
  };
  const list = compile("app/api/client/daily/pretraining-documents/route.ts", {
    "next/server": responses,
    "@/lib/dailyContractingParty": {},
    "@/lib/server/dailyPretrainingTemplate": {},
    "@/lib/server/dailyDelegatedRegistrationDecision": {},
    "@/lib/server/agentAssistance": {},
    "@/lib/server/dailyOrganisationContext": context,
    "@/lib/server/dailyPretrainingDocumentHtml": {}
  });
  const download = compile("app/api/client/daily/pretraining-documents/download/route.ts", {
    "next/server": responses, "@/lib/server/dailyOrganisationContext": context
  });
  const get = (session = sessionA) => list.GET({
    url: "https://selen.invalid/api/client/daily/pretraining-documents" +
      (session === null ? "" : "?session_id=" + encodeURIComponent(session))
  });
  const fetchDocument = (id = "document-a") => download.GET({
    url: "https://selen.invalid/api/client/daily/pretraining-documents/download?id=" + id
  });
  return { calls, signed, get, fetchDocument };
}

test("Avant : session invalide rejetée avant toute lecture PostgREST", async () => {
  const f = fixture();
  const result = await f.get(sessionA + "),organisation_id.eq.of-b");
  assert.equal(result.status, 400);
  assert.equal(f.calls.length, 0);
});

test("Avant : panne des inscriptions refuse une liste partielle sans divulguer SQL", async () => {
  const f = fixture({ enrolmentsFailure: true });
  const result = await f.get();
  assert.equal(result.status, 503);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.doesNotMatch(JSON.stringify(result.body), /SQL private|do-not-disclose/);
  assert.deepEqual(f.calls.map(c => c.table), ["daily_documents", "daily_session_enrolments"]);
});

test("Avant : panne des documents ne devient ni liste vide ni fuite SQL", async () => {
  const f = fixture({ documentsFailure: true });
  const result = await f.get();
  assert.equal(result.status, 503);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.doesNotMatch(JSON.stringify(result.body), /SQL private|do-not-disclose/);
});

test("Avant : liste session et documents restent bornés à l'OF et non cachables", async () => {
  const f = fixture();
  const result = await f.get();
  assert.equal(result.status, 200);
  assert.equal(result.body.documents.length, 1);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.ok(f.calls.every(c => c.filters.some(([key, value]) => key === "organisation_id" && value === "of-a")));
  assert.match(f.calls.find(c => c.table === "daily_documents").or, /linked_object_id\.in\./);
  assert.match(f.calls.find(c => c.table === "daily_documents").or, /22222222-2222-4222-8222-222222222222/);
});

test("Avant : liste globale bornée à l'OF et refus d'accès sans lecture", async () => {
  const f = fixture();
  const result = await f.get(null);
  assert.equal(result.status, 200);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.equal(f.calls.length, 1);
  assert.ok(f.calls[0].filters.some(([key, value]) => key === "organisation_id" && value === "of-a"));
  const blocked = fixture({ unauthorized: true });
  assert.equal((await blocked.get()).status, 403);
  assert.equal(blocked.calls.length, 0);
});

test("Avant : panne SQL du téléchargement refuse toute signature", async () => {
  const f = fixture({ documentsFailure: true });
  const result = await f.fetchDocument();
  assert.equal(result.status, 503);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.doesNotMatch(JSON.stringify(result.body), /SQL private|do-not-disclose/);
  assert.equal(f.signed.length, 0);
});

test("Avant : document étranger ou absent ne produit jamais d'URL signée", async () => {
  const f = fixture();
  assert.equal((await f.fetchDocument("foreign-document")).status, 404);
  assert.equal(f.signed.length, 0);
});

test("Avant : panne de signature retourne un état indisponible non cachable", async () => {
  const f = fixture({ signingFailure: true });
  const result = await f.fetchDocument();
  assert.equal(result.status, 503);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.equal(f.signed.length, 1);
  assert.doesNotMatch(JSON.stringify(result.body), /SQL private|do-not-disclose/);
});

test("Avant : téléchargement valide reste privé, signé pour 120 secondes", async () => {
  const f = fixture();
  const result = await f.fetchDocument();
  assert.equal(result.status, 307);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.deepEqual(f.signed, [{ path: "daily/of-a/private.pdf", seconds: 120 }]);
  assert.match(result.url, /^https:\/\/storage\.invalid\//);
});

test("Avant : document remplacé ou absent retourne 404 privé, jamais 503 ni signature", async () => {
  const f = fixture({ missingDocument: true });
  const result = await f.fetchDocument();
  assert.equal(result.status, 404);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.equal(f.signed.length, 0);
});

test("Avant : emplacement de stockage manquant refuse la signature", async () => {
  const f = fixture({ missingStoragePath: true });
  const result = await f.fetchDocument();
  assert.equal(result.status, 503);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.equal(f.signed.length, 0);
});

test("Avant : exception du stockage reste privée et ne divulgue pas SQL", async () => {
  const f = fixture({ signingThrow: true });
  const result = await f.fetchDocument();
  assert.equal(result.status, 503);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.doesNotMatch(JSON.stringify(result.body), /SQL private|do-not-disclose/);
  assert.equal(f.signed.length, 1);
});

test("Avant : téléchargement non autorisé n'interroge ni base ni stockage", async () => {
  const f = fixture({ unauthorized: true });
  const result = await f.fetchDocument();
  assert.equal(result.status, 403);
  assert.equal(f.calls.length, 0);
  assert.equal(f.signed.length, 0);
});
