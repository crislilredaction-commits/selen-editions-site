import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/client/daily/of-satisfaction/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/client/daily/satisfaction-of/page.tsx", import.meta.url), "utf8");
const sessionsPage = await readFile(new URL("../app/client/daily/sessions/page.tsx", import.meta.url), "utf8");
const followupPage = await readFile(new URL("../app/client/daily/suivi/page.tsx", import.meta.url), "utf8");

test("la satisfaction OF attend la clôture canonique du dossier", () => {
  assert.match(route, /daily_session_dossiers/);
  assert.match(route, /\.eq\("status", "completed"\)/);
});

test("le retour OF utilise le type canonique client et reste borné à l'organisme", () => {
  assert.match(route, /stakeholder_type: "client"/);
  assert.match(route, /entity_key: organisationId/);
  assert.match(route, /eq\("organisation_id", organisationId\)/);
});

test("une seule réponse est admise par session et organisme", () => {
  assert.match(route, /eq\("stakeholder_type", "client"\)/);
  assert.match(route, /eq\("entity_key", organisationId\)/);
  assert.match(route, /déjà été transmis/);
});

test("le questionnaire reprend les quatre dimensions demandées", () => {
  assert.match(page, /Note globale de Selen Daily/);
  assert.match(page, /Ce que vous avez apprécié/);
  assert.match(page, /Ce qui a moins bien fonctionné/);
  assert.match(page, /Vos suggestions/);
});

test("le retour est distinct de Qualiopi et utilise le schéma canonique du suivi de session", () => {
  assert.match(page, /distinct des questionnaires Qualiopi/);
  assert.match(route, /daily_session_followup_entries/);
  assert.match(route, /entry_type: "note"/);
  assert.match(route, /summary:/);
  assert.match(route, /description: noteParts/);
  assert.match(route, /status: needsAttention \? "open" : "resolved"/);
  assert.match(route, /created_by: user\.id/);
  assert.doesNotMatch(route, /entry_type: "client_satisfaction"/);
  assert.doesNotMatch(route, /author_user_id:/);
  assert.doesNotMatch(route, /followup_status:/);
});

test("la vue OF reconnaît les notes automatiques de satisfaction", () => {
  assert.match(followupPage, /entry_type: "incident" \| "adaptation" \| "note"/);
  assert.match(followupPage, /if \(entryType === "note"\) return "Note de suivi"/);
});

test("la page satisfaction OF est accessible depuis les sessions", () => {
  assert.match(sessionsPage, /\/client\/daily\/satisfaction-of/);
});
