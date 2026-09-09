import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const summarySource = await readFile(new URL("../lib/server/dailySessionFollowupSummary.ts", import.meta.url), "utf8");
const summaryComponent = await readFile(new URL("../components/daily/DailySessionFollowupSummary.tsx", import.meta.url), "utf8");

test("le suivi de session relit les signatures depuis la source Daily sans écriture", () => {
  assert.match(summarySource, /from\("daily_conventions"\)/);
  assert.match(summarySource, /daily_convention_signatures/);
  assert.match(summarySource, /\.eq\("organisation_id", organisationId\)/);
  assert.match(summarySource, /\.eq\("session_id", sessionId\)/);
  assert.doesNotMatch(summarySource, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("une ouverture de lien ne devient jamais une signature", () => {
  assert.match(summaryComponent, /Consulté · signature attendue/);
  assert.match(summaryComponent, /Le statut « signé » provient uniquement de la signature enregistrée/);
  assert.match(summaryComponent, /Consultation :/);
  assert.match(summaryComponent, /Signature :/);
});

test("la date d'envoi n'est pas inventée depuis la création de la signature", () => {
  assert.doesNotMatch(summarySource, /sent_at/);
  assert.match(summaryComponent, /Envoi : Non tracé/);
  assert.match(summaryComponent, /elle reste non tracée tant qu’aucune preuve d’email n’est reliée/);
});

test("les inscriptions abandonnées sont exclues du récapitulatif actif", () => {
  assert.match(summarySource, /status !== "abandoned"/);
});
