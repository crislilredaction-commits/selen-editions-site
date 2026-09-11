import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pagePath = new URL("../app/client/daily/dossiers/page.tsx", import.meta.url);
const routePath = new URL("../app/api/client/daily/session-dossiers/route.ts", import.meta.url);

const [page, route] = await Promise.all([
  readFile(pagePath, "utf8"),
  readFile(routePath, "utf8"),
]);

test("le dossier de session expose une timeline cliquable avant pendant après", () => {
  assert.match(page, /aria-label="Timeline de la session"/);
  assert.match(page, /scrollToPhase\(phase\)/);
  assert.match(page, /id={`phase-\$\{phase\}`}/);
  assert.match(page, /Avant la formation/);
  assert.match(page, /Pendant la formation/);
  assert.match(page, /Après la formation/);
});

test("le dossier réutilise le programme canonique de la formation", () => {
  assert.match(route, /detailed_program/);
  assert.match(route, /detailed_program_document_url/);
  assert.match(route, /registration_methods/);
  assert.match(route, /access_delays/);
  assert.match(page, /Programme applicable à cette session/);
  assert.match(page, /Ouvrir le document programme/);
  assert.match(page, /Modalités d’inscription/);
  assert.match(page, /Délais d’accès/);
});

test("le dossier consolide communications documents et signatures depuis les sources canoniques", () => {
  assert.match(route, /from\("daily_communications"\)/);
  assert.match(route, /from\("daily_communication_documents"\)/);
  assert.match(route, /from\("daily_documents"\)/);
  assert.match(route, /from\("daily_convention_signatures"\)/);
  assert.match(page, /Communications & preuves/);
  assert.match(page, /Journal de la session/);
  assert.match(page, /Signatures convention \/ contrat/);
});

test("les signatures de convention sans organisation_id sont bornées aux sessions déjà autorisées", () => {
  assert.match(route, /const sessionIds = \(sessions \?\? \[\]\)\.map/);
  assert.match(route, /daily_convention_signatures[\s\S]*\.in\("session_id", sessionIds\)/);
});

test("les ordres de mission sont bornés à l'organisation et aux sessions autorisées", () => {
  assert.match(route, /from\("daily_mission_orders"\)/);
  assert.match(route, /daily_mission_orders[\s\S]*\.eq\("organisation_id", context\.organisationId\)[\s\S]*\.overlaps\("session_ids", sessionIds\)/);
});

test("les signatures d'ordre de mission sont relues uniquement depuis les ordres autorisés", () => {
  assert.match(route, /const missionOrderIds = \(missionOrders \?\? \[\]\)\.map/);
  assert.match(route, /from\("daily_mission_order_signatures"\)[\s\S]*\.in\("mission_order_id", missionOrderIds\)/);
  assert.match(route, /missionOrders: missionOrders \?\? \[\]/);
  assert.match(route, /missionOrderSignatures: missionOrderSignatures \?\? \[\]/);
});

test("le dossier affiche les ordres de mission formateur séparément des contrats conventions", () => {
  assert.match(page, /type MissionOrder =/);
  assert.match(page, /setMissionOrders\(body\.missionOrders\|\|\[\]\)/);
  assert.match(page, /setMissionOrderSignatures\(body\.missionOrderSignatures\|\|\[\]\)/);
  assert.match(page, /Ordres de mission formateur/);
  assert.match(page, /Signature professionnelle · distincte du contrat \/ convention/);
  assert.match(page, /missionOrderStatusLabel/);
});

test("les signaux email ne sont jamais présentés comme preuve de signature", () => {
  assert.match(page, /Cliqué · signal technique/);
  assert.match(page, /Ouvert · signal technique/);
  assert.match(page, /jamais une preuve de signature/);
  assert.match(page, /signature\.signed_at/);
});

test("le lot reste une agrégation en lecture sans nouvelle source métier", () => {
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /daily_session_program/);
  assert.doesNotMatch(route, /daily_session_signature_timeline/);
  assert.doesNotMatch(route, /daily_mission_order_signature_timeline/);
});
