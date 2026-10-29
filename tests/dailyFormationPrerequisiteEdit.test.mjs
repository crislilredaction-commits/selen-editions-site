import assert from "node:assert/strict";
import test from "node:test";
import { harness, ids, uuid } from "./helpers/dailyOwnPositioningHarness.mjs";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const requirements = [{ id: "diploma", label: "Diplôme", description: "Copie lisible", required: true }];
const program = "/api/client/daily/uploads?id=00000000-0000-4000-8000-000000000020";
const descriptive = ["global_objective", "target_audience", "access_delays", "price", "detailed_program", "pedagogical_resources", "evaluation_methods"];
const networkForbidden = () => { throw new Error("Network forbidden"); };

function fixture(options = {}) {
  const h = harness({ allowFormationWrite: true, ...options });
  Object.assign(h.formation, {
    creation_mode: "selen_form", prerequisite_mode: "required", prerequisite_requirements: structuredClone(requirements),
    prerequisites: "Diplôme de niveau 4", duration_hours: 7, duration_days: 1, modality: "presentiel",
    learning_objectives: ["Savoir réaliser"], allowed_trainer_ids: [],
    ...Object.fromEntries(descriptive.map(key => [key, key + " value"])),
    detailed_program_document_url: program, contact_phone: "0102030405", contact_email: "of@example.invalid",
    results_pending: true, version: 3, previous_version_id: "older-formation",
    learning_assessment_mode: "external", learning_assessment_questions: [], updated_at: "2026-10-03T21:00:00.000Z",
    validation_note: "Ancienne validation", ...options.row,
  });
  const base = { ...structuredClone(h.formation), expected_updated_at: h.formation.updated_at, status: "review", positioning_choice_confirmed: true };
  for (const key of ["creation_mode", "prerequisite_mode", "prerequisite_requirements"]) delete base[key];
  if (options.prerequisiteConflict) {
    const from = h.admin.from.bind(h.admin);
    h.admin.from = table => {
      const query = from(table);
      if (table === "daily_formations") {
        const update = query.update.bind(query);
        query.update = payload => { update(payload); query.single = query.maybeSingle = async () => ({ data: null, error: { code: "PSE01", message: "Les prérequis sont utilisés par des candidatures en cours." } }); return query; };
      }
      return query;
    };
  }
  return { ...h, base, async call(extra = {}, method = "PATCH") {
    return h.load("app/api/client/daily/formations/route.ts")[method](new Request("https://selen.invalid/api/client/daily/formations", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...base, ...extra }),
    }));
  } };
}

for (const mode of ["selen_form", "program_import"]) test(`ancien formulaire ${mode}: les prérequis et la source restent conservés`, async () => {
  const f = fixture({ row: { creation_mode: mode } });
  if (mode === "program_import") {
    descriptive.forEach(key => { f.base[key] = ""; }); f.base.learning_objectives = [];
    delete f.base.detailed_program_document_url;
  }
  const response = await f.call({ title: "Intitulé corrigé" });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.formation.creation_mode, mode);
  assert.equal(data.formation.detailed_program_document_url, program);
  assert.equal(data.formation.prerequisite_mode, "required");
  assert.deepEqual(data.formation.prerequisite_requirements, requirements);
  assert.equal(data.formation.prerequisites, "Diplôme de niveau 4");
  assert.equal(data.formation.status, "review"); assert.equal(data.formation.validation_note, null);
  assert.equal(data.formation.id, ids.formation); assert.equal(data.formation.version, 3);
  assert.equal(data.formation.previous_version_id, "older-formation");
  assert.equal(data.formation.public_registration_token, "candidate-token");
  assert.equal(f.db.daily_formations.length, 1); assert.equal(f.sends.length, 0);
});

test("un champ de prérequis omis ne vide pas sa description", async () => {
  const f = fixture(); delete f.base.prerequisites;
  assert.equal((await f.call()).status, 200);
  assert.equal(f.formation.prerequisites, "Diplôme de niveau 4");
});

test("le choix explicite aucun prérequis retire les justificatifs même si leur champ est omis", async () => {
  const f = fixture(); assert.equal((await f.call({ prerequisite_mode: "none" })).status, 200);
  assert.equal(f.formation.prerequisite_mode, "none");
  assert.deepEqual(f.formation.prerequisite_requirements, []);
  assert.equal(f.formation.prerequisites, "Aucun prérequis");
});

test("les justificatifs modifiés conservent leurs identifiants et nettoient les doublons", async () => {
  const f = fixture();
  const response = await f.call({ prerequisite_mode: "required", prerequisites: " Expérience requise ", prerequisite_requirements: [
    { id: "experience", label: " Attestation ", description: " Signée ", required: true },
    { id: "duplicate", label: "attestation", description: "Doublon", required: true },
  ] });
  assert.equal(response.status, 200); assert.equal(f.formation.prerequisites, "Expérience requise");
  assert.deepEqual(f.formation.prerequisite_requirements, [{ id: "experience", label: "Attestation", description: "Signée", required: true }]);
});

for (const change of [
  { prerequisite_mode: "required", prerequisite_requirements: [] },
  { prerequisite_mode: "none", prerequisite_requirements: requirements },
  { creation_mode: "program_import", detailed_program_document_url: "" },
]) test(`une déclaration incohérente est refusée sans écriture: ${JSON.stringify(change)}`, async () => {
  const f = fixture(); const before = structuredClone(f.formation);
  assert.equal((await f.call(change)).status, 400);
  assert.deepEqual(f.formation, before); assert.deepEqual(f.writes, []);
});

test("des prérequis nouvellement obligatoires exigent de vrais justificatifs", async () => {
  const f = fixture({ row: { prerequisite_mode: "none", prerequisite_requirements: [] } });
  assert.equal((await f.call({ prerequisite_mode: "required" })).status, 400);
  assert.deepEqual(f.writes, []);
});

for (const [name, options, change, status] of [
  ["autre organisme", { row: { organisation_id: "other-of" } }, {}, 404],
  ["formation archivée", { row: { status: "archived" } }, {}, 400],
  ["permission absente", { noFormationAccess: true }, {}, 403],
]) test(`${name}: aucun prérequis ne peut être modifié`, async () => {
  const f = fixture(options); assert.equal((await f.call(change)).status, status);
  assert.deepEqual(f.writes, []); assert.deepEqual(f.sends, []);
});

test("la création conserve sa déclaration explicite et ses contrôles", async () => {
  const f = fixture();
  assert.equal((await f.call({ id: undefined, prerequisite_mode: "required", prerequisite_requirements: [] }, "POST")).status, 400);
  assert.deepEqual(f.writes, []);
  assert.equal((await f.call({ id: undefined, creation_submission_id: uuid(30), creation_mode: "program_import", learning_objectives: [], ...Object.fromEntries(descriptive.map(key => [key, ""])), prerequisite_mode: "none", prerequisite_requirements: [] }, "POST")).status, 200);
  assert.equal(f.db.daily_formations.length, 2);
});

test("le refus PostgreSQL pour une candidature en cours devient un conflit 409", async () => {
  const f = fixture({ prerequisiteConflict: true });
  const response = await f.call({ prerequisite_mode: "none" });
  assert.equal(response.status, 409); assert.match((await response.json()).error, /candidatures en cours/);
  assert.deepEqual(f.writes, []); assert.equal(f.formation.prerequisite_mode, "required");
});

async function uiFixture(options = {}) {
  const f = fixture(options); const requests = [], effects = [], state = [];
  let cursor = 0, firstRender = true, tree, nextId = 0;
  const jsx = (type, props) => ({ type, props });
  const policy = loadTypeScript("lib/dailyFormationCreationPolicy.ts");
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
      if (!init.method) return Response.json(url.endsWith("workspace") ? { workspace: { capabilities: { trainings: true }, trainers: [] } } : { formations: structuredClone(f.db.daily_formations) });
      const body = JSON.parse(init.body); requests.push({ url, body });
      if (url.endsWith("assessment-inline")) return Response.json({ formation: structuredClone(f.formation) });
      assert.equal(url, "/api/client/daily/formations"); assert.equal(init.method, "PATCH"); return f.call(body);
    } },
    "@/components/daily/FormationSourceUpload": { default: "Upload" },
    "@/components/ui/LoadingMascot": { default: "Loading" },
    "@/lib/daily/formationGuidance": loadTypeScript("lib/daily/formationGuidance.ts"),
    "@/lib/dailyFormationCreationPolicy": policy,
  }, { Response, Date, Error, window: { scrollTo() {} }, crypto: { randomUUID: () => `new-requirement-${++nextId}` }, fetch: networkForbidden }).default;
  const render = () => { cursor = 0; tree = Page(); firstRender = false; };
  function nodes(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(typeof node.type === "function" ? node.type(node.props) : node.props?.children ?? null)];
  }
  const find = predicate => { const matches = nodes(tree).filter(predicate); assert.equal(matches.length, 1); return matches[0]; };
  render(); effects.forEach(effect => effect()); await new Promise(resolve => setImmediate(resolve)); render();
  find(node => node.type === "button" && node.props.children === "Modifier").props.onClick(); render();
  return { ...f, requests, find, nodes: () => nodes(tree),
    change(label, value) { find(node => node.props?.["aria-label"] === label).props.onChange({ target: { value } }); render(); },
    click(label) { find(node => node.type === "button" && (Array.isArray(node.props.children) ? node.props.children.join("") : node.props.children) === label).props.onClick(); render(); },
    choice(value) { find(node => node.type?.name === "ChoiceRow" && node.props.choices.some(choice => choice.value === "required")).props.onChange(value); render(); },
    async submit() { await find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); render(); },
  };
}

for (const mode of ["selen_form", "program_import"]) test(`formulaire réel ${mode}: aller-retour sans perte des prérequis ni du mode`, async () => {
  const row = { creation_mode: mode };
  if (mode === "program_import") { descriptive.forEach(key => { row[key] = ""; }); row.learning_objectives = []; }
  const h = await uiFixture({ row }); const before = structuredClone(h.formation);
  const fields = h.nodes().filter(node => node.type?.name === "Field" && /^(Objectif principal|Public visé|Délais d'accès|Tarif|Contenu détaillé|Moyens pédagogiques|Modalités d’évaluation)/.test(node.props.label));
  assert.equal(fields.length, 7);
  for (const field of fields) {
    const controls = field.props.children;
    const required = controls.type === "div" ? controls.props.children[0].props.required : controls.props.required;
    assert.equal(required, mode === "selen_form", field.props.label);
  }
  await h.submit(); assert.equal(h.requests.length, 1);
  const payload = h.requests[0].body;
  assert.equal(payload.creation_mode, mode); assert.equal(payload.detailed_program_document_url, program);
  assert.equal(payload.prerequisite_mode, "required"); assert.deepEqual(payload.prerequisite_requirements, requirements);
  assert.equal(h.formation.prerequisite_mode, "required"); assert.deepEqual(h.formation.prerequisite_requirements, requirements);
  assert.equal(h.formation.id, before.id); assert.equal(h.formation.status, "review");
});

test("les contrôles réels ajoutent, modifient puis retirent un justificatif sans muter la source affichée", async () => {
  const h = await uiFixture(); h.change("Justificatif 1", "Diplôme actualisé"); h.change("Précision du justificatif 1", "Recto et verso");
  assert.deepEqual(h.formation.prerequisite_requirements, requirements);
  h.click("+ Ajouter un justificatif"); h.change("Justificatif 2", " Attestation "); h.change("Précision du justificatif 2", " Signée ");
  h.click("Retirer le justificatif 1"); await h.submit();
  assert.deepEqual(h.formation.prerequisite_requirements, [{ id: "new-requirement-1", label: "Attestation", description: "Signée", required: true }]);
  assert.equal(h.formation.status, "review"); assert.equal(h.sends.length, 0);
});

test("le retour à aucun prérequis vide la liste et ne ressuscite pas les anciens justificatifs", async () => {
  const h = await uiFixture(); h.choice("none"); h.choice("required"); await h.submit();
  assert.deepEqual(h.requests, []); assert.match(h.find(node => node.props?.role === "alert").props.children, /justificatif/);
  h.choice("none"); await h.submit();
  assert.equal(h.requests[0].body.prerequisite_mode, "none"); assert.deepEqual(h.requests[0].body.prerequisite_requirements, []);
  assert.equal(h.formation.prerequisites, "Aucun prérequis");
});

test("les justificatifs vides ne déclenchent ni écriture ni fausse confirmation", async () => {
  const h = await uiFixture(); h.change("Justificatif 1", "  "); await h.submit();
  assert.deepEqual(h.requests, []); assert.deepEqual(h.writes, []);
  assert.ok(h.find(node => node.props?.role === "alert"));
  assert.ok(h.find(node => node.type === "form"));
});

test("le formulaire rappelle que le dépôt ne vaut pas validation humaine", async () => {
  const h = await uiFixture();
  assert.ok(h.nodes().some(node => String(node.props?.children).includes("Déposer un fichier ne vaut jamais validation")));
});

test("une candidature en cours laisse le formulaire ouvert et ne confirme pas une modification refusée", async () => {
  const h = await uiFixture({ prerequisiteConflict: true }); h.choice("none"); await h.submit();
  assert.equal(h.requests.length, 1); assert.deepEqual(h.writes, []);
  assert.match(h.find(node => node.props?.role === "alert").props.children, /candidatures en cours/);
  assert.ok(h.find(node => node.type === "form"));
  assert.equal(h.nodes().filter(node => node.props?.role === "status").length, 0);
});

test("des prérequis obligatoires sans description sont refusés avant l’envoi", async () => {
  const h = await uiFixture(); h.change("Prérequis à satisfaire", " "); await h.submit();
  assert.deepEqual(h.requests, []); assert.match(h.find(node => node.props?.role === "alert").props.children, /prérequis à satisfaire/);
});

test("retirer l’original d’un programme importé bloque l’envoi sans changer son mode", async () => {
  const h = await uiFixture({ row: { creation_mode: "program_import" } });
  h.find(node => node.type === "Upload" && node.props.kind === "training_program_source").props.onUploaded("");
  // Re-render through an unchanged declaration before submitting the latest state.
  h.choice("required"); await h.submit();
  assert.deepEqual(h.requests, []); assert.match(h.find(node => node.props?.role === "alert").props.children, /programme original/);
  assert.equal(h.formation.creation_mode, "program_import");
});
