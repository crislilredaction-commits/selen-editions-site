import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const formationsManager = await readFile(new URL("../components/daily/DailyFormationsManager.tsx", import.meta.url), "utf8");
const formationsRoute = await readFile(new URL("../app/api/client/daily/formations/route.ts", import.meta.url), "utf8");
const onboardingPage = await readFile(new URL("../app/client/daily/onboarding/page.tsx", import.meta.url), "utf8");
const uploadRoute = await readFile(new URL("../app/api/client/daily/uploads/route.ts", import.meta.url), "utf8");
const dailyLayout = await readFile(new URL("../app/client/daily/layout.tsx", import.meta.url), "utf8");

test("la création de formation envoie au moins un objectif pédagogique éditable", () => {
  assert.match(formationsManager, /learning_objectives: \[""\]/);
  assert.match(formationsManager, /Objectifs pédagogiques/);
  assert.match(formationsRoute, /cleanTextArray\(body\.learning_objectives\)/);
});

test("la saisie des options de positionnement conserve la valeur saisie pendant la frappe", () => {
  assert.match(formationsManager, /onChange=\{\(e\) => onChange\(options\.map\(\(item, i\) => i === index \? e\.target\.value : item\)\)\}/);
  assert.doesNotMatch(formationsManager, /e\.target\.value\.trim\(\)/);
  assert.doesNotMatch(formationsManager, /e\.target\.value\.split\("\\n"\)\.map\(\(option\) => option\.trim\(\)\)\.filter\(Boolean\)/);
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

test("les parcours initiaux restent isolés de la navigation courante sans retirer l'assistance", () => {
  assert.match(dailyLayout, /pathname === "\/client\/daily\/onboarding" \|\| pathname === "\/client\/daily\/invitation"/);
  assert.match(dailyLayout, /!isStandaloneFlow/);
  assert.match(dailyLayout, /DailyFriendlyBanner/);
  assert.match(onboardingPage, /<ClientSupportBar/);
});

test("la création d'une formation est suivie par la création de sa session dédiée", () => {
  assert.match(formationsManager, /router\.push\(`\/client\/daily\/sessions\/new\?formation=\$\{encodeURIComponent\(formationId\)\}`\)/);
  assert.doesNotMatch(formationsManager, /showSessionForm/);
});

test("une formation non validée est modifiée en place sans recréer son token public", () => {
  assert.match(formationsRoute, /\["draft", "review", "correction_requested"\]\.includes\(existing\.status\)/);
  assert.match(formationsRoute, /\.from\("daily_formations"\)\.update\(\{/);
  assert.match(formationsRoute, /public_registration_token: existing\.public_registration_token \?\? registrationToken\(\)/);
  assert.match(formationsRoute, /versioned: false/);
});