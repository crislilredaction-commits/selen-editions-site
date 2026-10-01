import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sessionsRoute = await readFile(new URL("../app/api/client/daily/sessions/route.ts", import.meta.url), "utf8");

test("les inscriptions manuelles sont relues depuis daily_session_enrolments pour les sessions", () => {
  assert.match(sessionsRoute, /from\(["']daily_session_enrolments["']\)/);
  assert.match(sessionsRoute, /session_id/);
  assert.match(sessionsRoute, /learner_id/);
});

test("les inscriptions inactives ne remontent pas dans les apprenants de session", () => {
  assert.match(sessionsRoute, /declined/);
  assert.match(sessionsRoute, /cancelled/);
  assert.match(sessionsRoute, /abandoned/);
});

test("le raccord session protège des doublons et des inscriptions orphelines", () => {
  assert.match(sessionsRoute, /learner_id/);
  assert.match(sessionsRoute, /session_id/);
  assert.match(sessionsRoute, /Set|Map/);
});

// Execute the actual route with a read-only database double: any write or email fails.
const { default: ts } = await import("typescript");
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const routeCode = ts.transpileModule(sessionsRoute, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const participantExports = {};
new Function("exports", ts.transpileModule(await readFile(new URL("../lib/dailySessionParticipants.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(participantExports);

async function getSessions({ sessions = [], enrolments = [], errorTable, errorOffset, context: overrides = {} } = {}) {
  const queries = [];
  const admin = { from(table) {
    assert.ok(["daily_sessions", "daily_session_enrolments"].includes(table));
    const query = { table, filters: [] };
    queries.push(query);
    const builder = {
      select(columns) { query.columns = columns; return this; },
      eq(column, value) { query.filters.push(["eq", column, value]); return this; },
      in(column, values) { query.filters.push(["in", column, values]); return this; },
      not(column, operator, value) { query.filters.push(["not", column, operator, value]); return this; },
      order(column) { query.order = column; return this; },
      range(from, to) { query.range = [from, to]; return this; },
      then(resolve, reject) {
        const rows = structuredClone(table === "daily_sessions" ? sessions : enrolments);
        let data = rows.filter((row) => query.filters.every(([op, column, value, excluded]) => {
          if (op === "eq") return row[column] === value;
          if (op === "in") return value.includes(row[column]);
          return !excluded.slice(1, -1).split(",").includes(row[column]);
        }));
        if (table === "daily_session_enrolments") {
          const [from, to] = query.range ?? [0, 999];
          data = data.slice(from, to + 1);
        }
        return Promise.resolve({ data, error: table === errorTable && (errorOffset === undefined || query.range?.[0] === errorOffset) ? { message: "database unavailable" } : null }).then(resolve, reject);
      },
    };
    return builder;
  } };
  const context = { ok: true, organisationId: "of-a", capabilities: { sessions: true }, admin, ...overrides };
  const exports = {};
  const unexpected = () => { throw new Error("Unexpected write or email"); };
  new Function("require", "exports", routeCode)((name) => {
    if (name === "next/server") return require(name);
    if (name.endsWith("dailySessionParticipants")) return participantExports;
    if (name.endsWith("dailyOrganisationContext")) return { getDailyOrganisationReadContext: async () => context };
    return new Proxy({}, { get: () => unexpected });
  }, exports);
  const response = await exports.GET(new Request("https://selen.test/api/client/daily/sessions"));
  return { status: response.status, body: await response.json(), queries };
}

const session = (id, extra = {}) => ({ id, organisation_id: "of-a", beneficiaries: [], individual_beneficiaries: [], companies: [], ...extra });
const enrolment = (sessionId, learnerId, extra = {}) => ({
  session_id: sessionId, learner_id: learnerId, organisation_id: "of-a", status: "confirmed",
  daily_learners: { id: learnerId, organisation_id: "of-a", first_name: "Marie", last_name: "Dupont", email: `${learnerId}@example.test`, phone: "0102030405" },
  ...extra,
});

test("GET rattache les apprenants actifs à leur session et conserve les autres données", async () => {
  const first = session("s1", { daily_formations: { title: "Formation" }, registration_status: "sent" });
  const second = session("s2");
  const result = await getSessions({ sessions: [first, second], enrolments: [enrolment("s2", "l2"), enrolment("s1", "l1", { status: "pending" })] });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.sessions[0], { ...first, beneficiaries: [{ participant_source: "daily_session_enrolments", learner_id: "l1", first_name: "Marie", last_name: "Dupont", email: "l1@example.test", phone: "0102030405" }] });
  assert.equal(result.body.sessions[1].beneficiaries[0].learner_id, "l2");
  assert.deepEqual(first.beneficiaries, []);
  assert.deepEqual(result.queries[1].filters, [["eq", "organisation_id", "of-a"], ["in", "session_id", ["s1", "s2"]], ["not", "status", "in", "(declined,cancelled,abandoned)"]]);
});

test("GET exclut les inactifs, les autres OF et les orphelins", async () => {
  const foreignLearner = enrolment("s1", "foreign");
  foreignLearner.daily_learners.organisation_id = "of-b";
  const result = await getSessions({
    sessions: [session("s1"), session("other", { organisation_id: "of-b" })],
    enrolments: [
      ...["declined", "cancelled", "abandoned"].map((status) => enrolment("s1", status, { status })),
      enrolment("s1", "other-of", { organisation_id: "of-b" }), enrolment("other", "foreign-session"),
      enrolment("missing", "orphan"), enrolment("s1", "missing-learner", { daily_learners: null }),
      enrolment("s1", "empty-relation", { daily_learners: [] }), foreignLearner,
    ],
  });
  assert.deepEqual(result.body.sessions, [session("s1")]);
});

test("GET déduplique par identifiant et email dans toutes les listes, par session", async () => {
  const existing = session("s1", {
    beneficiaries: [{ learner_id: "l1", email: "old@example.test" }],
    individual_beneficiaries: [{ email: " L2@EXAMPLE.TEST " }],
    companies: [{ name: "Entreprise", participants: [{ email: "l3@example.test" }] }],
  });
  const relation = enrolment("s1", "l4");
  relation.daily_learners = [relation.daily_learners];
  const result = await getSessions({ sessions: [existing, session("s2")], enrolments: [
    enrolment("s1", "l1"), enrolment("s1", "l2"), enrolment("s1", "l3"), relation, relation, enrolment("s2", "l1"),
  ] });
  assert.equal(result.body.sessions[0].beneficiaries.length, 2);
  assert.equal(result.body.sessions[0].beneficiaries[1].learner_id, "l4");
  assert.deepEqual(result.body.sessions[0].companies, existing.companies);
  assert.deepEqual(result.body.sessions[0].individual_beneficiaries, existing.individual_beneficiaries);
  assert.equal(result.body.sessions[1].beneficiaries[0].learner_id, "l1");
});

test("GET gère les listes vides, les erreurs et les droits sans effet de bord", async () => {
  const empty = await getSessions();
  assert.deepEqual(empty.body, { sessions: [] });
  assert.equal(empty.queries.length, 1);
  for (const errorTable of ["daily_sessions", "daily_session_enrolments"]) {
    const failed = await getSessions({ sessions: [session("s1")], errorTable });
    assert.equal(failed.status, 500);
    assert.deepEqual(failed.body, { error: "database unavailable" });
  }
  const denied = await getSessions({ context: { ok: false, status: 403, error: "Forbidden" } });
  assert.equal(denied.status, 403);
  assert.equal(denied.queries.length, 0);
  const disabled = await getSessions({ context: { capabilities: { sessions: false } } });
  assert.deepEqual(disabled.body, { sessions: [] });
  assert.equal(disabled.queries.length, 0);
  const assisted = await getSessions({ sessions: [session("s1")], context: { assisted: true, capabilities: {} } });
  assert.equal(assisted.body.sessions.length, 1);
});

test("GET accepte les anciennes listes nulles et les apprenants sans email", async () => {
  const first = enrolment("s1", "l1");
  first.daily_learners.email = null;
  const second = enrolment("s1", "l2");
  second.daily_learners.email = null;
  const result = await getSessions({
    sessions: [session("s1", { beneficiaries: null, individual_beneficiaries: null, companies: null })],
    enrolments: [first, second, first],
  });
  assert.deepEqual(result.body.sessions[0].beneficiaries.map((row) => row.learner_id), ["l1", "l2"]);
});


test("GET restitue toutes les inscriptions au-delà de la première page", async () => {
  const enrolments = Array.from({ length: 1005 }, (_, index) => enrolment("s1", `l${index}`));
  const result = await getSessions({ sessions: [session("s1")], enrolments });
  assert.equal(result.status, 200);
  assert.equal(result.body.sessions[0].beneficiaries.length, 1005);
  assert.equal(result.body.sessions[0].beneficiaries[1004].learner_id, "l1004");
  const queries = result.queries.filter((query) => query.table === "daily_session_enrolments");
  assert.deepEqual(queries.map((query) => query.range), [[0, 999], [1000, 1999], [1005, 2004]]);
  for (const query of queries) {
    assert.equal(query.order, "id");
    assert.deepEqual(query.filters, queries[0].filters);
  }
  const failed = await getSessions({ sessions: [session("s1")], enrolments, errorTable: "daily_session_enrolments", errorOffset: 1000 });
  assert.equal(failed.status, 500);
  assert.deepEqual(failed.body, { error: "database unavailable" });
});

// Real POST/PATCH handlers, with only explicitly allowed in-memory mutations and effects.
function writer(sessions) {
  const effects = [];
  const writes = [];
  const admin = {
    from(table) {
      assert.ok(["daily_sessions", "daily_formations"].includes(table), `Unexpected table ${table}`);
      const filters = [];
      let payload;
      let operation;
      const builder = {
        select() { return this; },
        eq(key, value) { filters.push([key, value, false]); return this; },
        neq(key, value) { filters.push([key, value, true]); return this; },
        update(value) { assert.equal(table, "daily_sessions"); operation = "update"; payload = structuredClone(value); return this; },
        insert(value) { assert.equal(table, "daily_sessions"); operation = "insert"; payload = structuredClone(value); return this; },
        async maybeSingle() {
          assert.equal(table, "daily_formations");
          assert.deepEqual(filters, [["id", "f1", false], ["organisation_id", "of-a", false], ["status", "archived", true]]);
          const formation = { id: "f1", organisation_id: "of-a", status: "validated" };
          return { data: filters.every(([key, value, neq]) => neq ? formation[key] !== value : formation[key] === value) ? formation : null, error: null };
        },
        async single() {
          assert.equal(table, "daily_sessions");
          assert.ok(payload);
          let row;
          if (operation === "update") {
            assert.deepEqual(filters.map(([key]) => key), ["id", "organisation_id"]);
            row = sessions.find((item) => filters.every(([key, value]) => item[key] === value));
            assert.ok(row, "Update must target an existing session in the organisation");
            Object.assign(row, payload);
          } else {
            assert.equal(operation, "insert");
            row = { id: "created", ...payload };
            sessions.push(row);
          }
          writes.push(structuredClone(payload));
          return { data: structuredClone(row), error: null };
        },
      };
      return builder;
    },
    async rpc(name, args) {
      assert.equal(name, "daily_prepare_upper_tier_if_needed");
      assert.deepEqual(args, { p_user_id: "billing-u1" });
      effects.push("tier");
      return { data: 3, error: null };
    },
  };
  const context = { ok: true, organisationId: "of-a", user: { id: "u1" }, admin };
  const exports = {};
  new Function("require", "exports", routeCode)((name) => {
    if (name === "next/server") return require(name);
    if (name.endsWith("dailySessionParticipants")) return participantExports;
    if (name.endsWith("dailyOrganisationContext")) return {
      async getDailyOrganisationContext(req, capability, options) {
        assert.equal(capability, "sessions");
        assert.deepEqual(options, { allowAssistanceWrite: true });
        return context;
      },
      async getDailyOrganisationBillingUserId(org, user) {
        assert.equal(org, "of-a"); assert.equal(user, "u1");
        return "billing-u1";
      },
    };
    if (name.endsWith("dailyEnterprisePortalAccess")) return {
      async sendEnterprisePortalAccessForSessionCompanies(client, args) {
        assert.equal(client, admin);
        assert.deepEqual(args, { sessionId: sessions.at(-1).id, origin: "https://selen.test", createdBy: "u1", source: "manual_company" });
        effects.push("company");
        return [];
      },
    };
    if (name.endsWith("agentAssistance")) return { logAgentAssistanceAction() { assert.fail("Unexpected assistance write"); } };
    assert.fail(`Unexpected dependency ${name}`);
  }, exports);
  return {
    writes, effects,
    async save(body, method = "PATCH") {
      const response = await exports[method](new Request("https://selen.test/api/client/daily/sessions", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }));
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      return response.json();
    },
  };
}

const editable = {
  formation_id: "f1", start_date: "2060-01-01", end_date: "2060-01-01", modality: "presentiel",
  location_address: "Salle de test", schedule_blocks: [{ date: "2060-01-01", start: "09:00", end: "10:00" }],
};
const participantCount = (row) => row.beneficiaries.length + row.individual_beneficiaries.length
  + row.companies.reduce((count, company) => count + company.participants.length, 0);

for (const removal of ["cancelled", "declined", "abandoned", "removed"]) {
  for (const historical of [false, true]) {
    test(`GET → PATCH → GET garde les inscrits calculés hors stockage : ${removal}, historique=${historical}`, async () => {
      const person = (id) => ({ first_name: "Marie", last_name: "Dupont", email: `${id}@example.test`, phone: "0102030405" });
      const old = historical ? {
        beneficiaries: [person("legacy")], individual_beneficiaries: [person("individual")],
        companies: [{ name: "Entreprise", address: "Paris", siret: "", email: "", participants: [person("company")] }],
      } : {};
      const sessions = [session("s1", { ...editable, ...old })];
      const enrolments = [enrolment("s1", "l1"), enrolment("s1", "l1"),
        ...(historical ? ["legacy", "individual", "company"].map((id) => enrolment("s1", id)) : [])];
      const before = structuredClone(sessions[0]);
      const write = writer(sessions);
      for (let iteration = 0; iteration < 3; iteration++) {
        const read = await getSessions({ sessions, enrolments });
        assert.equal(participantCount(read.body.sessions[0]), historical ? 4 : 1);
        assert.equal(read.body.sessions[0].beneficiaries.at(-1).participant_source, "daily_session_enrolments");
        await write.save({ ...read.body.sessions[0], internal_reference: `modification-${iteration}` });
        assert.equal(sessions[0].internal_reference, `modification-${iteration}`);
        for (const key of ["beneficiaries", "individual_beneficiaries", "companies"]) {
          assert.deepEqual(sessions[0][key], before[key]);
          assert.deepEqual(write.writes.at(-1)[key], before[key]);
        }
        const after = await getSessions({ sessions, enrolments });
        assert.equal(participantCount(after.body.sessions[0]), historical ? 4 : 1);
      }
      assert.equal(write.effects.filter((effect) => effect === "tier").length, 3);
      assert.equal(write.effects.filter((effect) => effect === "company").length, 3);
      if (removal === "removed") enrolments.length = 0;
      else enrolments.forEach((row) => { row.status = removal; });
      const final = await getSessions({ sessions, enrolments });
      assert.deepEqual(final.body.sessions[0].beneficiaries, before.beneficiaries);
      assert.equal(participantCount(final.body.sessions[0]), historical ? 3 : 0);
    });
  }
}

test("le helper du formulaire conserve les anciens identifiants et ne retire que la provenance explicite", async () => {
  const rows = [{ name: "Historique" }, { learner_id: "old", email: "old@example.test" },
    { participant_source: "manual", email: "manual@example.test" },
    { participant_source: "daily_session_enrolments", learner_id: "new", email: "new@example.test" }];
  const snapshot = structuredClone(rows);
  assert.deepEqual(participantExports.storedSessionParticipants(rows), rows.slice(0, 3));
  assert.deepEqual(rows, snapshot);
  assert.deepEqual(participantExports.storedSessionParticipants(null), []);
  const manager = await readFile(new URL("../components/daily/DailySessionsManager.tsx", import.meta.url), "utf8");
  assert.match(manager, /beneficiaries: storedSessionParticipants\(session.beneficiaries\)/);
  assert.match(manager, /individual_beneficiaries: storedSessionParticipants\(session.individual_beneficiaries\)/);
  assert.match(manager, /participants: storedSessionParticipants\(company.participants\)/);
});

test("POST et PATCH filtrent aussi les lignes dérivées dans les listes particuliers et entreprises", async () => {
  for (const method of ["POST", "PATCH"]) {
    const sessions = method === "PATCH" ? [session("s1")] : [];
    const write = writer(sessions);
    const legacy = { learner_id: "old", first_name: "Ancien", last_name: "Participant", email: "old@example.test", phone: "" };
    const derived = { ...legacy, learner_id: "new", participant_source: "daily_session_enrolments" };
    const rows = [legacy, derived];
    await write.save({ ...editable, id: "s1", beneficiaries: rows, individual_beneficiaries: rows,
      companies: [{ name: "Entreprise", participants: rows }] }, method);
    const normalized = { first_name: "Ancien", last_name: "Participant", email: "old@example.test", phone: "" };
    assert.deepEqual(sessions[0].beneficiaries, [normalized]);
    assert.deepEqual(sessions[0].individual_beneficiaries, [normalized]);
    assert.deepEqual(sessions[0].companies[0].participants, [normalized]);
  }
});
