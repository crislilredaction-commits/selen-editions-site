import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helper = await readFile(new URL("../lib/server/dailyConfirmedAbandonment.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/client/daily/enrolments/abandon/route.ts", import.meta.url), "utf8");
const portal = await readFile(new URL("../app/api/daily-portal/[token]/route.ts", import.meta.url), "utf8");
const docs = await readFile(new URL("./dailyAbandonedDocumentSends.test.mjs", import.meta.url), "utf8");
const satisfaction = await readFile(new URL("./dailySatisfactionCadence.test.mjs", import.meta.url), "utf8");
const attendanceFollowup = await readFile(new URL("../app/api/daily-portal/[token]/followup/route.ts", import.meta.url), "utf8");

test("l'abandon confirmé exige une date et un motif explicites", () => {
  assert.match(route, /date d’abandon et motif sont requis/);
  assert.match(helper, /reason/);
  assert.match(helper, /occurredAt/);
});

test("seul l'OF habilité à gérer la session peut confirmer l'abandon", () => {
  assert.match(route, /getDailyOrganisationContext\(request, "sessions"\)/);
  assert.match(helper, /\.eq\("organisation_id", organisationId\)/);
  assert.match(helper, /\.eq\("session_id", sessionId\)/);
});

test("la décision passe explicitement l'inscription à abandoned", () => {
  assert.match(helper, /update\(\{ status: "abandoned"/);
  assert.doesNotMatch(attendanceFollowup, /update\(\{\s*status:\s*"abandoned"/);
});

test("l'abandon est historisé dans la fiche de suivi sans rester en tâche ouverte", () => {
  assert.match(helper, /daily_session_followup_entries/);
  assert.match(helper, /summary: "Abandon confirmé"/);
  assert.match(helper, /status: "resolved"/);
  assert.match(helper, /description: reason/);
});

test("les accès apprenant et émargement sont révoqués", () => {
  assert.match(helper, /daily_portal_access_tokens/);
  assert.match(helper, /daily_attendance_access_tokens/);
  assert.match(helper, /status: "revoked"/);
});

test("un portail apprenant refuse aussi une inscription devenue inactive même si le token était encore actif", () => {
  assert.match(portal, /activeLearnerEnrolment/);
  assert.match(portal, /Cette inscription n’est plus active/);
  assert.match(portal, /daily_portal_access_tokens/);
  assert.match(portal, /status:"revoked"/);
});

test("les preuves existantes ne sont jamais supprimées lors d'un abandon", () => {
  assert.doesNotMatch(helper, /\.delete\(/);
  assert.doesNotMatch(route, /\.delete\(/);
  assert.match(docs, /abandoned/);
});

test("les flux futurs de documents et de satisfaction excluent déjà les abandons", () => {
  assert.match(docs, /abandoned/);
  assert.match(satisfaction, /abandoned/);
  assert.match(satisfaction, /activeDailyEnrolment/);
});
