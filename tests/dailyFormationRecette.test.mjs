import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dailyPage = await readFile(new URL("../app/client/daily/page.tsx", import.meta.url), "utf8");
const formationsPage = await readFile(new URL("../app/client/daily/formations/page.tsx", import.meta.url), "utf8");
const formationsRoute = await readFile(new URL("../app/api/client/daily/formations/route.ts", import.meta.url), "utf8");
const onboardingPage = await readFile(new URL("../app/client/daily/onboarding/page.tsx", import.meta.url), "utf8");
const uploadRoute = await readFile(new URL("../app/api/client/daily/uploads/route.ts", import.meta.url), "utf8");

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

test("le client peut demander un accompagnement pendant tout le paramétrage autonome", () => {
  assert.match(onboardingPage, /form\.current_step > 1 && form\.setup_choice === "self"/);
  assert.match(onboardingPage, /Je souhaite être accompagné/);
  assert.match(onboardingPage, /setup_choice: "video" as const/);
});

test("la création d'une session est orientée vers sa page dédiée", () => {
  assert.match(dailyPage, /router\.push\("\/client\/daily\/sessions"\)/);
  assert.doesNotMatch(dailyPage, /showSessionForm/);
});
