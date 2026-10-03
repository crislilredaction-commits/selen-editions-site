import assert from "node:assert/strict";
import test from "node:test";
import { harness, ids } from "./helpers/dailyOwnPositioningHarness.mjs";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const revision = "2026-10-03T21:00:00.000Z";
const externalRevision = "2026-10-03T21:05:00.000Z";
const networkForbidden = () => { throw new Error("Network forbidden"); };

function fixture(options = {}) {
  const h = harness({ allowFormationWrite: true, ...options });
  Object.assign(h.formation, {
    creation_mode: "selen_form", prerequisite_mode: "none", prerequisite_requirements: [], prerequisites: "Aucun prérequis",
    global_objective: "Objectif", learning_objectives: ["Savoir faire"], allowed_trainer_ids: [], target_audience: "Public",
    duration_hours: 7, duration_days: 1, modality: "presentiel", access_delays: "Deux jours", price: "100",
    detailed_program: "Contenu du programme", detailed_program_document_url: "", pedagogical_resources: "Supports",
    evaluation_methods: "Évaluation", contact_phone: "0102030405", contact_email: "of@example.invalid", results_pending: true,
    learning_assessment_mode: "external", learning_assessment_instructions: null, learning_assessment_questions: [],
    version: 3, previous_version_id: "history", validation_note: "Ancienne revue", ...options.row,
  });
  const base = { ...structuredClone(h.formation), expected_updated_at: revision, title: "Intitulé corrigé", status: "review", positioning_choice_confirmed: true };
  return { ...h, base, async call(extra = {}, exact = false) {
    return h.load("app/api/client/daily/formations/route.ts").PATCH(new Request("https://selen.invalid/api/client/daily/formations", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(exact ? extra : { ...base, ...extra }),
    }));
  } };
}

test("la version ouverte permet une modification, une seconde saisie ancienne est refusée", async () => {
  const f = fixture(); assert.equal((await f.call()).status, 200);
  const updated = structuredClone(f.formation);
  assert.notEqual(updated.updated_at, revision); assert.equal(updated.title, "Intitulé corrigé");
  assert.equal(updated.id, ids.formation); assert.equal(updated.status, "review"); assert.equal(updated.version, 3);
  assert.equal(updated.public_registration_token, "candidate-token"); assert.equal(updated.previous_version_id, "history");
  assert.equal(updated.validation_note, null);
  assert.equal((await f.call({ title: "Ancienne saisie" })).status, 409);
  assert.deepEqual(f.formation, updated); assert.equal(f.writes.length, 1);
  assert.equal(f.sends.length, 0);
});

for (const value of [undefined, null, "", "pas-une-date", 42]) test(`version manquante ou invalide ${String(value)}: aucun enregistrement`, async () => {
  const f = fixture(); const before = structuredClone(f.formation);
  assert.equal((await f.call({ expected_updated_at: value })).status, 400);
  assert.deepEqual(f.formation, before); assert.deepEqual(f.writes, []);
});

test("un programme modifié avant la lecture n’est pas remplacé par l’ancienne saisie", async () => {
  const f = fixture(); Object.assign(f.formation, { title: "Modification OF plus récente", updated_at: externalRevision });
  const before = structuredClone(f.formation);
  assert.equal((await f.call()).status, 409); assert.deepEqual(f.formation, before); assert.deepEqual(f.writes, []);
});

for (const [name, change] of [
  ["autre modification", { title: "Modification plus récente", updated_at: externalRevision }],
  ["archivage", { status: "archived", archived_at: externalRevision }],
  ["nouvelle décision Studio", { status: "correction_requested", validation_note: "Retour Studio récent" }],
  ["périmètre modifié", { organisation_id: "another-of" }],
  ["suppression", null],
]) test(`entre lecture et écriture, ${name} empêche toute confirmation ou écrasement`, async () => {
  const f = fixture({ beforeFormationUpdate(rows) { if (change) Object.assign(rows[0], change); else rows.splice(0); } });
  const response = await f.call(); assert.equal(response.status, 409); assert.deepEqual(f.writes, []);
  if (change) for (const [key, value] of Object.entries(change)) assert.equal(f.formation[key], value);
  else assert.deepEqual(f.db.daily_formations, []);
});

test("le statut brouillon et les évaluations existantes restent conservés", async () => {
  const questions = [{ id: "q", label: "Question", type: "free_text", required: true }];
  const f = fixture({ row: { status: "draft", learning_assessment_mode: "selen_quiz", learning_assessment_questions: questions } });
  assert.equal((await f.call({ status: "draft" })).status, 200);
  assert.equal(f.formation.status, "draft"); assert.deepEqual(f.formation.learning_assessment_questions, questions);
});

async function uiFixture(options = {}) {
  const f = fixture(options); const requests = [], state = [], effects = [];
  let cursor = 0, tree, firstRender = true, failed = false;
  const jsx = (type, props) => ({ type, props });
  const Page = loadTypeScript("components/daily/DailyFormationsManager.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    react: {
      useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
      useRef(initial) { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index]; },
      useMemo: callback => callback(), useCallback: callback => callback,
      useEffect(callback) { if (firstRender) effects.push(callback); },
    },
    "next/navigation": { useRouter: () => ({ push() { throw new Error("Unexpected navigation"); } }) },
    "@/components/AgentAssistanceBanner": { assistanceFetch: async (url, init = {}) => {
      if (!init.method) return Response.json(url.endsWith("workspace") ? { workspace: { capabilities: { trainings: true } } } : { formations: structuredClone(f.db.daily_formations) });
      const body = JSON.parse(init.body); requests.push({ url, body });
      if (url.endsWith("assessment-inline")) {
        if (options.assessmentFailure && !failed) { failed = true; return Response.json({ error: "Évaluation indisponible" }, { status: 503 }); }
        return Response.json({ formation: structuredClone(f.formation) });
      }
      assert.equal(url, "/api/client/daily/formations");
      const result = await f.call(body, true);
      if (options.unknownProgramResult && !failed) { failed = true; assert.equal(result.status, 200); throw new Error("Connexion interrompue après l’enregistrement"); }
      return result;
    } },
    "@/components/daily/FormationSourceUpload": { default: "Upload" },
    "@/components/ui/LoadingMascot": { default: "Loading" },
    "@/lib/daily/formationGuidance": loadTypeScript("lib/daily/formationGuidance.ts"),
    "@/lib/dailyFormationCreationPolicy": loadTypeScript("lib/dailyFormationCreationPolicy.ts"),
  }, { Request, Response, Date, Error, window: { scrollTo() {} }, crypto: { randomUUID: () => "isolated-requirement" }, fetch: networkForbidden }).default;
  const render = () => { cursor = 0; tree = Page(); firstRender = false; };
  function nodes(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(typeof node.type === "function" ? node.type(node.props) : node.props?.children ?? null)]; }
  const find = predicate => { const matches = nodes(tree).filter(predicate); assert.equal(matches.length, 1); return matches[0]; };
  render(); effects.forEach(effect => effect()); await new Promise(resolve => setImmediate(resolve)); render();
  find(node => node.type === "button" && node.props.children === "Modifier").props.onClick(); render();
  return { ...f, requests, find, nodes: () => nodes(tree), async submit() { await find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); render(); } };
}

test("le formulaire réel transmet la date capturée à son ouverture", async () => {
  const h = await uiFixture(); await h.submit();
  assert.equal(h.requests.length, 2); assert.equal(h.requests[0].body.expected_updated_at, revision);
  assert.equal(h.requests[1].body.expected_updated_at, h.formation.updated_at);
});

test("une ancienne saisie du formulaire garde le texte et signale le conflit sans lancer l’évaluation", async () => {
  const h = await uiFixture(); Object.assign(h.formation, { title: "Modification plus récente", updated_at: externalRevision });
  await h.submit(); assert.equal(h.requests.length, 1); assert.deepEqual(h.writes, []);
  assert.equal(h.formation.title, "Modification plus récente");
  assert.match(h.find(node => node.props?.role === "alert").props.children, /modifi|recharg/i);
  assert.ok(h.find(node => node.type === "form"));
  assert.equal(h.nodes().filter(node => node.props?.role === "status").length, 0);
});

test("après un échec d’évaluation, la reprise utilise uniquement la version du programme déjà enregistrée", async () => {
  const h = await uiFixture({ assessmentFailure: true }); await h.submit();
  const savedRevision = h.formation.updated_at;
  assert.match(h.find(node => node.props?.role === "alert").props.children, /Évaluation indisponible/);
  await h.submit(); assert.equal(h.requests.length, 4);
  assert.equal(h.requests[0].body.expected_updated_at, revision);
  assert.equal(h.requests[2].body.expected_updated_at, savedRevision);
  assert.equal(h.requests[3].body.expected_updated_at, h.formation.updated_at);
  assert.equal(h.writes.length, 2);
});

test("un enregistrement à résultat réseau inconnu ne fabrique pas une version pour le réessai", async () => {
  const h = await uiFixture({ unknownProgramResult: true }); await h.submit();
  const saved = structuredClone(h.formation); assert.equal(h.writes.length, 1);
  assert.match(h.find(node => node.props?.role === "alert").props.children, /Connexion interrompue/);
  await h.submit(); assert.equal(h.requests.length, 2); assert.equal(h.writes.length, 1);
  assert.equal(h.requests[1].body.expected_updated_at, revision); assert.deepEqual(h.formation, saved);
  assert.equal(h.nodes().filter(node => node.props?.role === "status").length, 0);
});
