import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const routePath = "app/api/client/daily/trainer-profile/route.ts";
const response = { json: (body, init = {}) => ({ status: init.status ?? 200, body }) };
function loadRoute({ own, delegated } = {}) {
  return loadTypeScript(routePath, {
    "next/server": { NextResponse: response },
    "@/lib/server/dailyTrainerWorkspaceContext": { getDailyTrainerWorkspaceContext: async () => own },
    "@/lib/server/dailyOrganisationContext": { getDailyOrganisationReadContext: async () => delegated ?? { ok: false, status: 403 } },
  });
}

function queryFor(table, result, calls) {
  const query = {
    select() { return this; },
    update(value) { calls.push([table, "update", value]); return this; },
    eq(field, value) { calls.push([table, "eq", field, value]); return this; },
    neq() { return this; },
    not() { return this; },
    in() { return this; },
    order() { return this; },
    maybeSingle: async () => result,
    single: async () => result,
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return query;
}

test("profil formateur : identité ambiguë refusée en GET et PATCH avant toute lecture ou écriture", async () => {
  const api = loadRoute({ own: { ok: false, status: 409, error: "Plusieurs fiches formateur correspondent à votre identité." } });
  const get = await api.GET(new Request("https://example.test/api/client/daily/trainer-profile"));
  const patch = await api.PATCH({ json: async () => ({ biography: "injection" }) });
  assert.equal(get.status, 409);
  assert.equal(patch.status, 409);
});

test("profil formateur : PATCH cible uniquement le profil canonique et son OF", async () => {
  const calls = [];
  const admin = { from: (table) => queryFor(table, { data: { id: "trainer-a", engagement_type: "owner" }, error: null }, calls) };
  const api = loadRoute({ own: { ok: true, trainerId: "trainer-a", orgId: "of-a", admin } });
  const result = await api.PATCH({ json: async () => ({ biography: "Expérience", specialties: ["Animation"], professional_email: " FORMATEUR@EXAMPLE.TEST " }) });
  assert.equal(result.status, 200);
  assert.equal(result.body.profile.id, "trainer-a");
  assert.equal(result.body.annual_review_exempt, true);
  assert.ok(calls.some((call) => call[0] === "daily_trainer_profiles" && call[1] === "eq" && call[2] === "id" && call[3] === "trainer-a"));
  assert.ok(calls.some((call) => call[0] === "daily_trainer_profiles" && call[1] === "eq" && call[2] === "organisation_id" && call[3] === "of-a"));
  assert.ok(calls.some((call) => call[1] === "update" && call[2].professional_email === "formateur@example.test"));
});

test("profil formateur : GET personnel cible le profil canonique et son OF", async () => {
  const calls = [];
  const admin = { from: (table) => queryFor(table, { data: { id: "trainer-a", engagement_type: "external" }, error: null }, calls) };
  const api = loadRoute({ own: { ok: true, trainerId: "trainer-a", orgId: "of-a", admin } });
  const result = await api.GET(new Request("https://example.test/api/client/daily/trainer-profile"));
  assert.equal(result.status, 200);
  assert.equal(result.body.profile.id, "trainer-a");
  assert.ok(calls.some((call) => call[1] === "eq" && call[2] === "id" && call[3] === "trainer-a"));
  assert.ok(calls.some((call) => call[1] === "eq" && call[2] === "organisation_id" && call[3] === "of-a"));
});

test("profil formateur : accès délégués bornés à l'OF assisté avant toute lecture des jetons", async () => {
  const calls = [];
  const data = {
    daily_trainer_profiles: { data: [{ id: "trainer-a", display_name: "Formateur A", professional_email: "trainer@example.test" }], error: null },
    daily_sessions: { data: [{ id: "session-a", trainer_ids: ["trainer-a"], daily_formations: { title: "Formation" } }], error: null },
    daily_portal_access_tokens: { data: [{ id: "access-a", session_id: "session-a", entity_key: "trainer:trainer-a", expires_at: null }], error: null },
  };
  const admin = { from: (table) => queryFor(table, data[table], calls) };
  const api = loadRoute({ delegated: { ok: true, assisted: true, organisationId: "of-a", admin }, own: { ok: false, status: 403 } });
  const result = await api.GET(new Request("https://example.test/api/client/daily/trainer-profile"));
  assert.equal(result.status, 200);
  assert.equal(result.body.assistance, true);
  assert.equal(result.body.trainers[0].sessions[0].portal_access_id, "access-a");
  assert.ok(calls.some((call) => call[0] === "daily_portal_access_tokens" && call[1] === "eq" && call[2] === "organisation_id" && call[3] === "of-a"));
});

test("assistance formateur : email partagé n'attribue jamais le lien canonique ou historique d'un collègue", async () => {
  const calls = [];
  const admin = { from: (table) => queryFor(table, {
    daily_trainer_profiles: { data: [
      { id: "trainer-a", professional_email: "shared@example.test" },
      { id: "trainer-b", professional_email: "shared@example.test" },
    ], error: null },
    daily_sessions: { data: [{ id: "session-a", trainer_ids: ["trainer-a", "trainer-b"], daily_formations: { title: "Session" } }], error: null },
    daily_portal_access_tokens: { data: [
      { id: "legacy", session_id: "session-a", entity_key: "shared@example.test", entity_email: "shared@example.test", expires_at: null },
      { id: "canonical-a", session_id: "session-a", entity_key: "trainer:trainer-a", entity_email: "shared@example.test", expires_at: null },
    ], error: null },
  }[table], calls) };
  const api = loadRoute({ delegated: { ok: true, assisted: true, organisationId: "of-a", admin } });
  const result = await api.GET(new Request("https://example.test/api/client/daily/trainer-profile"));
  assert.equal(result.status, 200);
  const byId = Object.fromEntries(result.body.trainers.map(t => [t.id, t.sessions[0].portal_access_id]));
  assert.equal(byId["trainer-a"], "canonical-a");
  assert.equal(byId["trainer-b"], null);
});

test("assistance formateur : lien historique accepté seulement pour une identité email unique dans la session", async () => {
  const calls = [];
  const admin = { from: (table) => queryFor(table, {
    daily_trainer_profiles: { data: [
      { id: "trainer-a", professional_email: "solo@example.test" },
      { id: "trainer-b", professional_email: "other@example.test" },
    ], error: null },
    daily_sessions: { data: [{ id: "session-a", trainer_ids: ["trainer-a"], daily_formations: { title: "Session" } }], error: null },
    daily_portal_access_tokens: { data: [
      { id: "foreign-canonical", session_id: "session-a", entity_key: "trainer:trainer-b", entity_email: "solo@example.test", expires_at: null },
      { id: "legacy-a", session_id: "session-a", entity_key: "solo@example.test", entity_email: "solo@example.test", expires_at: null },
    ], error: null },
  }[table], calls) };
  const api = loadRoute({ delegated: { ok: true, assisted: true, organisationId: "of-a", admin } });
  const result = await api.GET(new Request("https://example.test/api/client/daily/trainer-profile"));
  assert.equal(result.status, 200);
  assert.equal(result.body.trainers.length, 1);
  assert.equal(result.body.trainers[0].sessions[0].portal_access_id, "legacy-a");
});

test("assistance formateur : un jeton canonique étranger ne devient pas un accès par email", async () => {
  const calls = [];
  const admin = { from: (table) => queryFor(table, {
    daily_trainer_profiles: { data: [{ id: "trainer-a", professional_email: "solo@example.test" }], error: null },
    daily_sessions: { data: [{ id: "session-a", trainer_ids: ["trainer-a"], daily_formations: { title: "Session" } }], error: null },
    daily_portal_access_tokens: { data: [{ id: "foreign", session_id: "session-a", entity_key: "trainer:other", entity_email: "solo@example.test", expires_at: null }], error: null },
  }[table], calls) };
  const api = loadRoute({ delegated: { ok: true, assisted: true, organisationId: "of-a", admin } });
  const result = await api.GET(new Request("https://example.test/api/client/daily/trainer-profile"));
  assert.equal(result.status, 200);
  assert.equal(result.body.trainers[0].sessions[0].portal_access_id, null);
});
