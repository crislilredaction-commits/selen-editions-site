import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const onboardingPage = await readFile(
  new URL("../app/client/daily/onboarding/page.tsx", import.meta.url),
  "utf8",
);
const dashboardPage = await readFile(
  new URL("../components/daily/DailyDashboardOverviewV2.tsx", import.meta.url),
  "utf8",
);
const accountPanel = await readFile(
  new URL("../components/daily/DailyAccountPanel.tsx", import.meta.url),
  "utf8",
);

test("le NDA n'est pas présenté comme facultatif lorsqu'il existe", () => {
  assert.match(onboardingPage, /<Input label="Numéro NDA"/);
  assert.match(
    onboardingPage,
    /Si votre organisme possède déjà un numéro de déclaration d&apos;activité, il doit être renseigné ici\./,
  );
  assert.doesNotMatch(onboardingPage, /NDA[^\n]{0,40}facultatif/i);
});

test("les imports utilisent un bouton encadré explicite plutôt que le sélecteur natif", () => {
  assert.match(onboardingPage, /const inputRef = useRef<HTMLInputElement>\(null\)/);
  assert.match(onboardingPage, /style=\{s\.fileInput\}/);
  assert.match(onboardingPage, /style=\{s\.fileButton\}/);
  assert.match(onboardingPage, /Choisir un fichier/);
  assert.match(onboardingPage, /fileInput: \{ display: "none" \}/);
  assert.match(onboardingPage, /fileButton: \{[^\n]*border: "1px solid var\(--rust\)"/);
});

test("le BPF n'est réclamé qu'aux organismes qui ont un NDA et ne sont pas en première année", () => {
  assert.match(dashboardPage, /nda_number\?:string\|null/);
  assert.match(
    dashboardPage,
    /Boolean\(onboarding\.nda_number\?\.trim\(\)\)&&!onboarding\.first_nda_year&&!onboarding\.nda_or_bpf_document_url/,
  );
  assert.match(accountPanel, /const hasNda=Boolean\(text\(org\.nda_number\|\|onboarding\?\.nda_number\)\.trim\(\)\)/);
  assert.match(accountPanel, /required:hasNda&&!firstNdaYear/);
  assert.match(accountPanel, /Non requis tant que l'organisme n'a pas de NDA/);
});

test("l'onboarding Daily vouvoie l'organisme", () => {
  assert.match(onboardingPage, /Choisissez comment vous préférez paramétrer votre espace/);
  assert.match(onboardingPage, /Votre espace Daily est prêt à démarrer/);
  assert.doesNotMatch(onboardingPage, /\b(?:tu|ton|ta)\b/i);
  assert.doesNotMatch(onboardingPage, /\bChoisis\b/);
  assert.doesNotMatch(onboardingPage, /\bContinue à\b/);
  assert.doesNotMatch(onboardingPage, /t'aider/);
});
