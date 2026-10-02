import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const descriptive = ["global_objective", "learning_objectives", "detailed_program", "target_audience", "access_delays", "price", "pedagogical_resources", "evaluation_methods"];
const original = "https://storage.invalid/programme-original.docx";
const positioningOriginal = "/api/client/daily/uploads?id=00000000-0000-4000-8000-000000000005";
function harness() {
  const state = [], requests = [], navigation = [];
  let cursor = 0, tree;
  const jsx = (type, props) => ({ type, props });
  function Upload() { throw new Error("Real upload must never run"); }
  const Page = loadTypeScript("app/client/daily/formations/new/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    } },
    "next/navigation": { useRouter: () => ({ push: value => navigation.push(value) }) },
    "@/components/daily/FormationSourceUpload": { default: Upload },
    "@/components/AgentAssistanceBanner": { assistanceFetch: async (url, options) => {
      assert.equal(url, "/api/client/daily/formations");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["Content-Type"], "application/json");
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ formation: { id: "formation/test" } }) };
    } },
  }, {
    crypto: { randomUUID: () => "requirement-1" },
    FormData: class { constructor(values) { this.values = values; } get(key) { return this.values[key] ?? null; } },
  }).default;
  function nodes(node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children ?? null)];
  }
  const render = () => { cursor = 0; tree = Page(); };
  const find = predicate => { const matches = nodes().filter(predicate); assert.equal(matches.length, 1); return matches[0]; };
  render();
  return {
    requests, navigation, nodes, find,
    radio(index) { nodes().filter(n => n.props?.type === "radio")[index].props.onChange(); render(); },
    upload(kind = "training_program_source") { const url = kind === "positioning_questionnaire_source" ? positioningOriginal : original; find(n => n.type === Upload && n.props.kind === kind).props.onUploaded(url); render(); assert.equal(find(n => n.type === Upload && n.props.kind === kind).props.value, url); },
    change(node, value) { node.props.onChange({ target: { value } }); render(); },
    click(label) { find(n => n.type === "button" && n.props.children === label).props.onClick(); render(); },
    async submit(values = {}) {
      let prevented = false;
      await find(n => n.type === "form").props.onSubmit({ preventDefault() { prevented = true; }, currentTarget: values });
      assert.equal(prevented, true); render();
      assert.equal(find(n => n.props?.type === "submit").props.disabled, false);
    },
  };
}

for (const mode of ["program_import", "selen_form"]) {
  test(`${mode}: real choice, descriptive requirements and API payload`, async () => {
    const h = harness();
    h.radio(1); h.radio(mode === "program_import" ? 0 : 1);
    const radios = h.nodes().filter(n => n.props?.type === "radio");
    assert.equal(radios[mode === "program_import" ? 0 : 1].props.checked, true);
    for (const name of descriptive) {
      const fields = h.nodes().filter(n => n.props?.name === name);
      assert.equal(fields.length, mode === "selen_form" ? 1 : 0, name);
      if (fields.length) assert.equal(fields[0].props.required, true, name);
    }
    if (mode === "program_import") h.upload();
    h.upload("positioning_questionnaire_source");
    const values = { title: " Formation ", ...Object.fromEntries(mode === "selen_form" ? descriptive.map(name => [name, ` ${name} value `]) : []) };
    await h.submit(values);
    assert.equal(h.requests.length, 1);
    const payload = h.requests[0];
    assert.equal(payload.creation_mode, mode);
    assert.equal(payload.title, "Formation");
    assert.equal(payload.detailed_program_document_url, mode === "program_import" ? original : null);
    for (const name of descriptive) assert.deepEqual(payload[name], name === "learning_objectives" ? (mode === "selen_form" ? [`${name} value`] : []) : mode === "selen_form" ? `${name} value` : "");
    assert.equal(payload.prerequisite_mode, "none");
    assert.deepEqual(payload.prerequisite_requirements, []);
    assert.equal(payload.prerequisites, "Aucun prérequis");
    assert.equal(payload.status, "draft");
    assert.equal(payload.results_pending, true);
    assert.equal(payload.positioning_mode, "off_platform");
    assert.equal(payload.positioning_questionnaire_document_url, positioningOriginal);
    assert.deepEqual(h.navigation, ["/client/daily/sessions/new?formation=formation%2Ftest"]);
  });
}

test("missing original blocks transport and navigation", async () => {
  const h = harness(); await h.submit();
  assert.equal(h.requests.length, 0); assert.equal(h.navigation.length, 0);
  assert.ok(h.find(n => n.props?.role === "alert").props.children);
});

for (const mode of [0, 1]) test(`prerequisites are independent and require explicit evidence in mode ${mode}`, async () => {
  const h = harness(); h.radio(mode); if (mode === 0) h.upload();
  h.upload("positioning_questionnaire_source");
  h.radio(3); await h.submit();
  assert.equal(h.requests.length, 0);
  h.click("+ Ajouter un justificatif");
  h.change(h.find(n => n.type === "input" && n.props.value === ""), "   ");
  await h.submit(); assert.equal(h.requests.length, 0);
  h.change(h.find(n => n.type === "input" && n.props.value === "   "), " Diplôme ");
  h.change(h.find(n => n.type === "textarea" && n.props.value === ""), " Copie lisible ");
  await h.submit({ prerequisites: " Niveau requis " });
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].prerequisite_mode, "required");
  assert.equal(h.requests[0].prerequisites, "Niveau requis");
  assert.deepEqual(h.requests[0].prerequisite_requirements, [{ id: "requirement-1", label: "Diplôme", description: "Copie lisible", required: true }]);
  assert.equal(h.requests[0].status, "draft");
  assert.equal(h.requests[0].results_pending, true);
  // Keep the explicit human-validation warning; deposition semantics are also guarded by p0d-prerequisite-evidence.test.mjs.
  assert.ok(h.nodes().some(n => n.type === "p" && String(n.props.children).includes("Déposer un fichier ne vaut jamais validation")));
  h.radio(2); await h.submit();
  assert.deepEqual(h.requests[1].prerequisite_requirements, []);
  h.radio(3); await h.submit();
  assert.equal(h.requests.length, 2, "returning to required must not resurrect cleared evidence");
});


test("own positioning requires its separate original before creation", async () => {
 const h = harness(); h.radio(1); await h.submit();
 assert.equal(h.requests.length, 0); assert.equal(h.navigation.length, 0);
 assert.match(h.find(n => n.props?.role === "alert").props.children, /questionnaire de positionnement/);
 h.upload("positioning_questionnaire_source"); await h.submit();
 assert.equal(h.requests.length, 1); assert.equal(h.requests[0].positioning_questionnaire_document_url, positioningOriginal);
});
