import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dailyPage = await readFile(new URL("../app/client/daily/page.tsx", import.meta.url), "utf8");
const formationsPage = await readFile(new URL("../app/client/daily/formations/page.tsx", import.meta.url), "utf8");
const formationsRoute = await readFile(new URL("../app/api/client/daily/formations/route.ts", import.meta.url), "utf8");
const onboardingPage = await readFile(new URL("../app/client/daily/onboarding/page.tsx", import.meta.url), "utf8");
const uploadRoute = await readFile(new URL("../app/api/client/daily/uploads/route.ts", import.meta.url), "utf8");
const dailyLayout = await readFile(new URL("../app/client/daily/layout.tsx", import.meta.url), "utf8");

test("la création de formation envoie au moins un objectif pédagogique éditable", () => {
  assert.match(dailyPage, /learning_objectives: \[""\]/);
  assert.match(dailyPage, /Objectifs pédagogiques/);
  assert.match(formationsRoute, /cleanTextArray\(body\.learning_objectives\)/);
});

test("la saisie des options de positionnement conserve espaces et retours à la ligne pendant la frappe", () => {
  assert.match(dailyPage, /options: value\.split\("\\n"\)/);
  assert.match(formationsPage, /options: e\.target\.value\.split\("\\n"\)/);
  assert.doesNotMatch(dailyPage, /value\.split\("\\n"\)\.map\(\(option\) => option\.trim\(\)\)\.filter\(Boolean\)/);
});

test("les documents de recette utilisent un import de fichier contrôlé", () => {
  for (const kind of ["organisation_logo", "insee_notice", "qualiopi_certificate", "bpf", "trainer_cv", "training_program_source", "positioning_questionnaire_source"]) {
    assert.match(uploadRoute, new RegExp(kind));
  }
  assert.match(uploadRoute, /MAX_FILE_SIZE = 10 \* 1024 \* 1024/);
  assert.match(onboardingPage, /type="file"/);
});

test("le NDA est exigé lorsqu'il existe et les imports utilisent un bouton encadré explicite", () => {
  assert.match(onboardingPage, /label="Numéro NDA"/);
  assert.match(onboardingPage, /Si votre organisme possède déjà un numéro de déclaration d&apos;activité, il doit être renseigné ici\./);
  assert.doesNotMatch(onboardingPage, /NDA[^\n]{0,40}facultatif/i);
  assert.match(onboardingPage, /style=\{s\.fileInput\}/);
  assert.match(onboardingPage, /style=\{s\.fileButton\}/);
  assert.match(onboardingPage, /Choisir un fichier/);
  assert.match(onboardingPage, /fileInput: \{ display: "none" \}/);
  assert.match(onboardingPage, /fileButton: \{[^\n]*border: "1px solid var\(--rust\)"/);
});

test("le client peut demander un accompagnement pendant tout le paramétrage autonome", () => {
  assert.match(onboardingPage, /form\.current_step > 1 && form\.setup_choice === "self"/);
  assert.match(onboardingPage, /Je souhaite être accompagné/);
  assert.match(onboardingPage, /setup_choice: "video" as const/);
});

test("la navigation à onglets est masquée pendant les parcours initiaux, sans retirer l'assistance", () => {
  assert.match(dailyLayout, /pathname === "\/client\/daily"/);
  assert.match(dailyLayout, /pathname === "\/client\/daily\/onboarding"/);
  assert.match(dailyLayout, /hideNavigation \? null : <nav/);
  assert.match(onboardingPage, /<ClientSupportBar/);
  assert.match(dailyPage, /<ClientSupportBar/);
});

test("la création d'une session est orientée vers sa page dédiée", () => {
  assert.match(dailyPage, /router\.push\("\/client\/daily\/sessions"\)/);
  assert.doesNotMatch(dailyPage, /showSessionForm/);
});
