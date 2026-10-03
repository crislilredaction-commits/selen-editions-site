import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const revision = "2026-10-03T19:00:00.000Z";
const newerRevision = "2026-10-03T19:01:00.000Z";
const token = "isolated-assistance-fixture";
const quiz = [{ id: "q1", label: "Question", type: "single_choice", options: ["A", "B"], correct_answers: ["B"], points: 2, required: true }];
const networkForbidden = () => { throw new Error("Network forbidden"); };

function fixture(options = {}) {
  const rows = options.absent ? [] : [{
    id: "formation-a", organisation_id: options.foreign ? "of-b" : "of-a",
    status: "review", updated_at: revision, agent_review_signaled_at: revision,
    version: 3, public_registration_token: "canonical-link", previous_version_id: "history",
    learning_assessment_mode: "external", learning_assessment_instructions: null,
    learning_assessment_questions: [], ...options.row,
  }];
  const audit = [], queries = [], writes = [];
  let raced = false;
  const assistance = { id: "assistance-a", agent_user_id: "agent-a", agent_email: "agent@example.invalid", organisation_id: "of-a", dossier_id: null, status: options.revoked ? "revoked" : "active", expires_at: options.expired ? "2000-01-01T00:00:00Z" : "2099-01-01T00:00:00Z", token_hash: crypto.createHash("sha256").update(token).digest("hex") };
  const pools = {
    daily_formations: rows,
    selen_agent_assistance_tokens: [assistance],
    agent_profiles: options.inactive ? [] : [{ id: "profile-a", user_id: "agent-a", email: "agent@example.invalid", is_active: true }],
    selen_admin_users: [], organisations: [{ id: "of-a", email: "client@example.invalid" }],
  };
  const admin = {
    auth: { admin: { listUsers: async () => ({ data: { users: [{ id: "client-a", email: "client@example.invalid" }] }, error: null }) } },
    from(table) {
      assert.ok(table in pools || table === "selen_agent_assistance_logs", table);
      const filters = []; let operation = "read", payload, columns;
      const execute = async () => {
        queries.push({ table, operation, filters: structuredClone(filters), columns });
        if (table === "selen_agent_assistance_logs") { assert.equal(operation, "insert"); audit.push(structuredClone(payload)); return { data: null, error: null }; }
        if (table === "daily_formations" && operation === "read" && options.readError) return { data: null, error: { message: "read failed" } };
        if (table === "daily_formations" && operation === "update" && !raced) { raced = true; options.race?.(rows); }
        const matches = pools[table].filter(row => filters.every(([op, key, value]) => op === "eq" ? row[key] === value : op === "neq" ? row[key] !== value : op === "gt" ? row[key] > value : op === "or" ? value.split(",").some(part => { const [key, , expected] = part.split("."); return row[key] === expected; }) : true));
        if (operation === "update") {
          if (table === "daily_formations" && options.writeError) return { data: null, error: { message: "write failed" } };
          if (matches[0]) {
            Object.assign(matches[0], structuredClone(payload));
            if (table === "daily_formations") { matches[0].updated_at = options.writeRevision ?? newerRevision; writes.push(structuredClone(payload)); }
          }
        }
        return { data: structuredClone(matches[0] ?? null), error: null };
      };
      return {
        select(value) { columns = value; return this; },
        eq(key, value) { filters.push(["eq", key, value]); return this; },
        neq(key, value) { filters.push(["neq", key, value]); return this; },
        gt(key, value) { filters.push(["gt", key, value]); return this; },
        or(value) { filters.push(["or", null, value]); return this; },
        limit() { return this; },
        update(value) { operation = "update"; payload = value; return this; },
        insert(value) { operation = "insert"; payload = value; return this; },
        maybeSingle: execute,
        async single() { const result = await execute(); return !result.data && !result.error ? { data: null, error: { message: "Expected one row", code: "PGRST116" } } : result; },
        then(resolve, reject) { return execute().then(resolve, reject); },
      };
    },
  };
  const globals = { Request, Response, Date, structuredClone, fetch: networkForbidden };
  const assistanceModule = loadTypeScript("lib/server/agentAssistance.ts", { crypto: { default: crypto } }, globals);
  const context = loadTypeScript("lib/server/dailyOrganisationContext.ts", {
    "@/lib/server/clientNdaAccess": { getAdminSupabase: () => admin },
    "@/lib/server/agentAssistance": assistanceModule,
    "@/lib/server/dailyClientWorkspace": { getDailyClientWorkspace: async () => options.assisted === false
      ? { ok: true, user: { id: "client-a" }, workspace: { capabilities: { trainings: !options.forbidden }, membership: { organisation_id: "of-a" } } }
      : { ok: false, status: 401, error: "Connexion requise." } },
  }, globals);
  const { PATCH } = loadTypeScript("app/api/client/daily/formations/assessment-inline/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/server/dailyOrganisationContext": context,
    "@/lib/server/agentAssistance": assistanceModule,
  }, globals);
  return {
    rows, audit, writes, queries,
    async call(body = {}) {
      return PATCH(new Request("https://selen.invalid/api/client/daily/formations/assessment-inline", {
        method: "PATCH", headers: { "Content-Type": "application/json", ...(options.assisted === false ? {} : { "x-selen-agent-assistance": options.forged ? "forged-fixture" : token }) },
        body: JSON.stringify({ id: "formation-a", mode: "selen_quiz", questions: quiz, expected_updated_at: revision, ...body }),
      }));
    },
  };
}

for (const assisted of [true, false]) test(`l’évaluation est enregistrée dans l’OF autorisé, assistance=${assisted}`, async () => {
  const f = fixture({ assisted }); const response = await f.call({ instructions: " Consignes " });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.assistanceMode, assisted);
  assert.equal(result.formation.updated_at, newerRevision);
  assert.equal(f.rows[0].learning_assessment_mode, "selen_quiz");
  assert.equal(f.rows[0].learning_assessment_instructions, "Consignes");
  assert.deepEqual(f.rows[0].learning_assessment_questions[0].correct_answers, ["B"]);
  assert.equal(f.rows[0].public_registration_token, "canonical-link");
  assert.equal(f.rows[0].version, 3);
  assert.equal(f.rows[0].previous_version_id, "history");
  assert.equal(f.audit.length, assisted ? 1 : 0);
  if (assisted) {
    assert.equal(f.audit[0].organisation_id, "of-a");
    assert.equal(f.audit[0].agent_user_id, "agent-a");
    assert.equal(f.audit[0].action, "daily_formation_assessment_update");
    assert.equal(f.audit[0].new_state.formation_id, "formation-a");
  }
  assert.equal(f.writes.length, 1);
});

for (const status of ["validated", "correction_requested"]) test(`${status}: une modification d’évaluation repart en revue`, async () => {
  const f = fixture({ row: { status, validation_note: "Ancienne revue", agent_review_signaled_at: null } });
  assert.equal((await f.call()).status, 200);
  assert.equal(f.rows[0].status, "review");
  assert.equal(f.rows[0].validation_note, null);
  assert.ok(Number.isFinite(Date.parse(f.rows[0].agent_review_signaled_at)));
});

test("le mode externe efface le questionnaire sans déplacer les autres données", async () => {
  const f = fixture({ row: { status: "draft", learning_assessment_mode: "selen_quiz", learning_assessment_questions: quiz } });
  assert.equal((await f.call({ mode: "external", instructions: "obsolete", questions: quiz })).status, 200);
  assert.equal(f.rows[0].status, "draft");
  assert.equal(f.rows[0].learning_assessment_instructions, null);
  assert.deepEqual(f.rows[0].learning_assessment_questions, []);
});

for (const options of [{ forged: true }, { expired: true }, { revoked: true }, { inactive: true }, { assisted: false, forbidden: true }]) test(`autorisation refusée sans écriture métier: ${JSON.stringify(options)}`, async () => {
  const f = fixture(options); assert.ok([401, 403].includes((await f.call()).status));
  assert.deepEqual(f.writes, []); assert.deepEqual(f.audit, []);
  assert.ok(f.queries.every(q => q.table !== "daily_formations"));
});

for (const options of [{ absent: true }, { foreign: true }, { row: { status: "archived" } }]) test(`formation inaccessible: ${JSON.stringify(options)}`, async () => {
  const f = fixture(options); assert.equal((await f.call()).status, 404);
  assert.deepEqual(f.writes, []); assert.deepEqual(f.audit, []);
});

async function uiFixture(options = {}) {
  const f = fixture({ writeRevision: "2026-10-03T19:02:00.000Z" });
  Object.assign(f.rows[0], { title: "Formation", positioning_mode: "off_platform", positioning_questionnaire_document_url: "/api/client/daily/uploads?id=positioning-a", learning_assessment_mode: "selen_quiz", learning_assessment_questions: structuredClone(quiz) });
  const requests = [], navigation = [], state = [], effects = [];
  let cursor = 0, tree, firstRender = true, release, failed = false;
  const held = options.hold ? new Promise(resolve => { release = resolve; }) : null;
  const jsx = (type, props) => ({ type, props });
  const component = loadTypeScript("components/daily/DailyFormationsManager.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    react: {
      useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
      useRef(initial) { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index]; },
      useCallback: callback => callback, useMemo: callback => callback(),
      useEffect(callback) { if (firstRender) effects.push(callback); },
    },
    "next/navigation": { useRouter: () => ({ push: url => navigation.push(url) }) },
    "@/components/AgentAssistanceBanner": { assistanceFetch: async (url, init = {}) => {
      if (!init.method) return Response.json(url.endsWith("workspace") ? { workspace: { capabilities: { trainings: true } } } : { formations: structuredClone(f.rows) });
      const body = JSON.parse(init.body); requests.push({ url, body });
      if (url.endsWith("assessment-inline")) {
        if (options.networkError && !failed) { failed = true; throw new Error("Connexion interrompue"); }
        if (options.race) f.rows[0].updated_at = "2026-10-03T19:03:00.000Z";
        return f.call(body);
      }
      assert.equal(url, "/api/client/daily/formations");
      if (held) await held;
      f.rows[0].updated_at = newerRevision;
      return Response.json({ formation: structuredClone(f.rows[0]), assistanceMode: true });
    } },
    "@/components/daily/FormationSourceUpload": { default: "Upload" },
    "@/components/ui/LoadingMascot": { default: "Loading" },
    "@/lib/daily/formationGuidance": loadTypeScript("lib/daily/formationGuidance.ts"),
    "@/lib/dailyFormationCreationPolicy": loadTypeScript("lib/dailyFormationCreationPolicy.ts"),
  }, { Response, Date, Error, window: { scrollTo() {} }, crypto: { randomUUID: () => "isolated-question" }, fetch: networkForbidden }).default;
  const render = () => { cursor = 0; tree = component(); firstRender = false; };
  function nodes(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children ?? null)]; }
  const find = predicate => { const result = nodes(tree).filter(predicate); assert.equal(result.length, 1); return result[0]; };
  const texts = () => nodes(tree).flatMap(node => typeof node.props?.children === "string" ? [node.props.children] : []).join("\n");
  render(); effects.forEach(effect => effect()); await new Promise(resolve => setImmediate(resolve)); render();
  find(node => node.type === "button" && node.props.children === "Modifier").props.onClick(); render();
  return { ...f, requests, navigation, texts, render, release,
    submit() { return find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); },
    submitButton() { return find(node => node.props?.type === "submit"); },
  };
}

test("le vrai formulaire transmet la version retournée après sauvegarde du programme", async () => {
  const h = await uiFixture(); await h.submit(); h.render();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].body.expected_updated_at, newerRevision);
  assert.notEqual(h.requests[1].body.expected_updated_at, revision);
  assert.equal(h.audit.length, 1);
  assert.match(h.texts(), /Formation mise à jour et renvoyée à Selen pour vérification/);
});

test("un conflit d’évaluation ne montre pas une confirmation de réussite", async () => {
  const h = await uiFixture({ race: true }); await h.submit(); h.render();
  assert.match(h.texts(), /La formation a changé/);
  assert.doesNotMatch(h.texts(), /Formation mise à jour et renvoyée/);
  assert.deepEqual(h.audit, []); assert.deepEqual(h.navigation, []);
  assert.equal(h.submitButton().props.disabled, false);
});

test("deux soumissions immédiates ne doublent pas les écritures", async () => {
  const h = await uiFixture({ hold: true }); const first = h.submit(); const second = h.submit();
  await Promise.resolve(); const started = h.requests.length;
  h.release(); await Promise.all([first, second]); h.render();
  assert.equal(started, 1);
  assert.equal(h.requests.length, 2); assert.equal(h.audit.length, 1);
});

test("après une erreur réseau, la saisie reste ouverte et une reprise est possible", async () => {
  const h = await uiFixture({ networkError: true }); await h.submit(); h.render();
  assert.match(h.texts(), /Connexion interrompue/);
  assert.equal(h.submitButton().props.disabled, false);
  assert.deepEqual(h.audit, []);
  await h.submit(); h.render();
  assert.equal(h.requests.length, 4); assert.equal(h.audit.length, 1);
  assert.match(h.texts(), /Formation mise à jour et renvoyée/);
});

for (const stamp of [null, "", " ", "invalid", 123]) test(`version ouverte requise: ${JSON.stringify(stamp)}`, async () => {
  const f = fixture(); assert.equal((await f.call({ expected_updated_at: stamp })).status, 400);
  assert.deepEqual(f.writes, []); assert.deepEqual(f.audit, []);
});

test("une version périmée n’écrase pas un questionnaire récent", async () => {
  const f = fixture({ row: { updated_at: newerRevision, learning_assessment_instructions: "Notes récentes" } });
  assert.equal((await f.call()).status, 409);
  assert.equal(f.rows[0].learning_assessment_instructions, "Notes récentes");
  assert.deepEqual(f.writes, []); assert.deepEqual(f.audit, []);
});

for (const change of ["questionnaire", "validated", "archived", "deleted"]) test(`une modification concurrente ${change} reste conservée`, async () => {
  const f = fixture({ race: rows => {
    if (change === "deleted") return rows.splice(0);
    rows[0].updated_at = newerRevision;
    if (change === "questionnaire") rows[0].learning_assessment_instructions = "Autre rédacteur";
    else rows[0].status = change;
  } });
  assert.equal((await f.call()).status, 409);
  assert.deepEqual(f.writes, []); assert.deepEqual(f.audit, []);
  if (change === "questionnaire") assert.equal(f.rows[0].learning_assessment_instructions, "Autre rédacteur");
  else if (change !== "deleted") assert.equal(f.rows[0].status, change);
});

for (const [options, body, status] of [
  [{ readError: true }, {}, 500], [{ writeError: true }, {}, 500],
  [{}, { mode: "forged" }, 400], [{}, { questions: [] }, 400],
  [{}, { questions: [{ ...quiz[0], options: ["A", "A"], correct_answers: ["A"] }] }, 400],
  [{}, { questions: [{ ...quiz[0], correct_answers: ["X"] }] }, 400],
]) test(`échec sans trace de succès: ${JSON.stringify(options)} ${JSON.stringify(body)}`, async () => {
  const f = fixture(options); assert.equal((await f.call(body)).status, status);
  assert.deepEqual(f.writes, []); assert.deepEqual(f.audit, []);
});
