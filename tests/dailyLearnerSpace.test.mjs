import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("l’espace apprenant expose les documents utiles avant formation", async () => {
  const resources = await read("app/api/daily-portal/[token]/resources/route.ts");
  const download = await read("app/api/daily-portal/[token]/document/route.ts");
  for (const source of [resources, download]) {
    assert.match(source, /convocation/);
    assert.match(source, /registration_positioning/);
    assert.match(source, /training_program/);
    assert.match(source, /organisation_shared/);
  }
});

test("les documents individuels restent bornés à l’inscription de l’apprenant", async () => {
  const resources = await read("app/api/daily-portal/[token]/resources/route.ts");
  assert.match(resources, /allowedEnrolmentIds/);
  assert.match(resources, /linked_object_type === "enrolment"/);
  assert.match(resources, /daily_learners\(email\)/);
});

test("le portail lit le positionnement depuis l’inscription canonique", async () => {
  const route = await read("app/api/daily-portal/[token]/route.ts");
  assert.match(route, /daily_session_enrolments/);
  assert.match(route, /positioning_status/);
  assert.match(route, /prerequisites_status/);
  assert.match(route, /enrolment/);
});

test("les actions apprenant suivent la phase réelle de la session", async () => {
  const workspace = await read("components/daily/DailyStakeholderWorkspace.tsx");
  assert.match(workspace, /Avant la formation/);
  assert.match(workspace, /Formation en cours/);
  assert.match(workspace, /Après la formation/);
  assert.match(workspace, /currentPhase === "after"/);
  assert.match(workspace, /Mon évaluation/);
});

test("la convocation ouvre directement le document concerné", async () => {
  const workspace = await read("components/daily/DailyStakeholderWorkspace.tsx");
  assert.match(workspace, /Consulter ma convocation/);
  assert.match(workspace, /document\?id=/);
});

test("le positionnement interactif ouvre la route dédiée sans stockage parallèle dans le workspace", async () => {
  const workspace = await read("components/daily/DailyStakeholderWorkspace.tsx");
  assert.match(workspace, /\/positionnement/);
  assert.match(workspace, /positioning_status/);
  assert.doesNotMatch(workspace, /positioning_answers\s*:/);
});
