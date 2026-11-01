import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const routePath = "app/api/client/daily/stakeholder-feedback/route.ts";
const organisationId = "of-test-a";
const feedbackId = "feedback-test-a";

function fixture({ denied = false, nonManager = false, postError = false, readError = false, updateError = false, concurrentChange = false, currentStatus = "forwarded_to_organisation" } = {}) {
  const reads = [];
  const writes = [];
  const admin = {
    from(table) {
      assert.equal(table, "daily_stakeholder_feedback");
      const filters = [];
      let operation = "read";
      let payload;
      return {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        insert(value) { operation = "insert"; payload = value; writes.push({ operation, payload, filters }); return this; },
        update(value) { operation = "update"; payload = value; writes.push({ operation, payload, filters }); return this; },
        async single() {
          assert.equal(operation, "insert");
          return postError
            ? { data: null, error: { message: "private SQL INSERT details" } }
            : { data: { id: feedbackId, created_at: "2026-11-01T05:00:00Z", status: "received" }, error: null };
        },
        async maybeSingle() {
          if (operation === "read") {
            reads.push({ filters });
            return readError
              ? { data: null, error: { message: "private SQL SELECT details" } }
              : { data: { id: feedbackId, organisation_id: organisationId, status: currentStatus }, error: null };
          }
          assert.equal(operation, "update");
          if (updateError) return { data: null, error: { message: "private SQL UPDATE details" } };
          if (concurrentChange) return { data: null, error: null };
          return { data: { id: feedbackId, status: currentStatus, organisation_response: payload.organisation_response, updated_at: payload.updated_at }, error: null };
        },
      };
    },
  };
  const context = denied
    ? { ok: false, status: 403, error: "Accès refusé." }
    : { ok: true, user: { email: "test@example.test" }, workspace: { membership: { organisation_id: organisationId, roles: nonManager ? ["trainer"] : ["manager"] } } };
  const route = loadTypeScript(routePath, {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ status: options.status ?? 200, body }) } },
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
    "@/lib/server/dailyClientWorkspace": { getDailyClientWorkspace: async () => context },
  });
  return { route, reads, writes, request: { json: async () => ({ submissionType: "complaint", subject: "Incident test", message: "Description test", id: feedbackId, response: "Réponse du responsable" }) } };
}

test("P0: la soumission OF ne divulgue pas une erreur SQL", async () => {
  const f = fixture({ postError: true });
  const result = await f.route.POST(f.request);
  assert.equal(result.status, 503);
  assert.doesNotMatch(result.body.error, /SQL|INSERT|private/i);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].payload.organisation_id, organisationId);
});

test("P0: la réponse OF échoue sans divulguer les détails de lecture SQL", async () => {
  const f = fixture({ readError: true });
  const result = await f.route.PATCH(f.request);
  assert.equal(result.status, 503);
  assert.doesNotMatch(result.body.error, /SQL|SELECT|private/i);
  assert.equal(f.writes.length, 0);
  assert.ok(f.reads[0].filters.some(([key, value]) => key === "organisation_id" && value === organisationId));
});

test("P0: une erreur SQL de mise à jour est masquée et le périmètre OF conservé", async () => {
  const f = fixture({ updateError: true });
  const result = await f.route.PATCH(f.request);
  assert.equal(result.status, 503);
  assert.doesNotMatch(result.body.error, /SQL|UPDATE|private/i);
  assert.ok(f.writes[0].filters.some(([key, value]) => key === "organisation_id" && value === organisationId));
  assert.ok(f.writes[0].filters.some(([key, value]) => key === "status" && value === "forwarded_to_organisation"));
});

test("P0: un changement concurrent de statut retourne 409 sans fausse confirmation", async () => {
  const f = fixture({ concurrentChange: true });
  const result = await f.route.PATCH(f.request);
  assert.equal(result.status, 409);
  assert.match(result.body.error, /changé de statut/i);
  assert.equal(result.body.ok, undefined);
});

test("P0: statut non répondable = 409 sans modification", async () => {
  const f = fixture({ currentStatus: "resolved" });
  const result = await f.route.PATCH(f.request);
  assert.equal(result.status, 409);
  assert.equal(f.writes.length, 0);
});

test("P0: seul le responsable peut répondre", async () => {
  const f = fixture({ nonManager: true });
  const result = await f.route.PATCH(f.request);
  assert.equal(result.status, 403);
  assert.equal(f.reads.length, 0);
  assert.equal(f.writes.length, 0);
});

test("P0: accès refusé bloque soumission et réponse avant toute écriture", async () => {
  const f = fixture({ denied: true });
  for (const method of ["POST", "PATCH"]) assert.equal((await f.route[method](f.request)).status, 403);
  assert.equal(f.reads.length, 0);
  assert.equal(f.writes.length, 0);
});

test("P0: le parcours normal répond une seule fois dans l'OF", async () => {
  const f = fixture();
  const result = await f.route.PATCH(f.request);
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.feedback.organisation_response, "Réponse du responsable");
  assert.equal(f.writes.length, 1);
  assert.ok(f.writes[0].filters.some(([key, value]) => key === "id" && value === feedbackId));
  assert.ok(f.writes[0].filters.some(([key, value]) => key === "organisation_id" && value === organisationId));
});
