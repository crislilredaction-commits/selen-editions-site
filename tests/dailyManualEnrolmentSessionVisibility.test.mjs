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
  assert.deepEqual(result.body.sessions[0], { ...first, beneficiaries: [{ learner_id: "l1", first_name: "Marie", last_name: "Dupont", email: "l1@example.test", phone: "0102030405" }] });
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
