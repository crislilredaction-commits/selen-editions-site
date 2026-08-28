import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const onboardingPage = await readFile(
  new URL("../app/client/daily/onboarding/page.tsx", import.meta.url),
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
