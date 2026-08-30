import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const organisation = await readFile(new URL("../app/api/client/daily/followup/route.ts", import.meta.url), "utf8");
const trainer = await readFile(new URL("../app/api/client/daily/trainer-followup/route.ts", import.meta.url), "utf8");
const trainerPortal = await readFile(new URL("../app/api/daily-portal/[token]/followup/route.ts", import.meta.url), "utf8");
const organisationFollowupPage = await readFile(new URL("../app/client/daily/suivi/page.tsx", import.meta.url), "utf8");
const trainerFollowupPage = await readFile(new URL("../app/client/daily/formateur/suivi-sessions/page.tsx", import.meta.url), "utf8");

test("suivi organisme: l’auteur vient de l’utilisateur authentifié et est relu", () => {
  assert.match(organisation, /author_role: "Organisme de formation"/);
  assert.match(organisation, /author_name: organisationAuthorName\(context\.user\)/);
  assert.match(organisation, /author_role,author_name/);
  assert.doesNotMatch(organisation, /text\(body, "author_(?:role|name)"\)/);
});

test("suivi formateur authentifié: l’auteur vient de la fiche formateur", () => {
  assert.match(trainer, /trainerName: String\(trainer\.display_name/);
  assert.match(trainer, /author_role: "Formateur"/);
  assert.match(trainer, /author_name: context\.trainerName/);
  assert.match(trainer, /author_role,author_name/);
  assert.doesNotMatch(trainer, /text\(body, "author_(?:role|name)"\)/);
});

test("suivi portail formateur: l’identité vient du jeton et non du corps de requête", () => {
  assert.match(trainerPortal, /entity_name,entity_email/);
  assert.match(trainerPortal, /author_role: "Formateur"/);
  assert.match(trainerPortal, /author_name: authorName/);
  assert.match(trainerPortal, /author_role,author_name/);
  assert.doesNotMatch(trainerPortal, /text\(body\.author_(?:role|name)\)/);
});

test("historique organisme: affiche l’auteur et conserve un repli pour les anciennes lignes", () => {
  assert.match(organisationFollowupPage, /author_role\?: string \| null/);
  assert.match(organisationFollowupPage, /author_name\?: string \| null/);
  assert.match(organisationFollowupPage, /Ajouté par :/);
  assert.match(organisationFollowupPage, /Auteur non renseigné \(historique antérieur\)/);
  assert.match(organisationFollowupPage, /entry\.author_role/);
});

test("historique formateur: affiche la même provenance sans masquer les anciennes lignes", () => {
  assert.match(trainerFollowupPage, /author_role\?: string \| null/);
  assert.match(trainerFollowupPage, /author_name\?: string \| null/);
  assert.match(trainerFollowupPage, /Ajouté par :/);
  assert.match(trainerFollowupPage, /Auteur non renseigné \(historique antérieur\)/);
  assert.match(trainerFollowupPage, /entry\.author_role/);
});
