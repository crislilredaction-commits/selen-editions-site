import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const summarySource = await readFile(new URL("../lib/server/dailySessionFollowupSummary.ts", import.meta.url), "utf8");
const summaryComponent = await readFile(new URL("../components/daily/DailySessionFollowupSummary.tsx", import.meta.url), "utf8");

test("le suivi de session relit les signatures et preuves d'envoi depuis les sources Daily sans écriture", () => {
  assert.match(summarySource, /from\("daily_conventions"\)/);
  assert.match(summarySource, /daily_convention_signatures/);
  assert.match(summarySource, /from\("daily_communications"\)/);
  assert.match(summarySource, /\.eq\("organisation_id", organisationId\)/);
  assert.match(summarySource, /\.eq\("session_id", sessionId\)/);
  assert.doesNotMatch(summarySource, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("une ouverture de lien ne devient jamais une signature", () => {
  assert.match(summaryComponent, /Consulté · signature attendue/);
  assert.match(summaryComponent, /« Signé » vient uniquement de la preuve de signature/);
  assert.match(summaryComponent, /Consultation :/);
  assert.match(summaryComponent, /Signature :/);
});

test("la date d'envoi vient du journal d'emails et n'est pas inventée depuis created_at", () => {
  assert.match(summarySource, /const sentAt = evidence\?\.sent_at \?\? null/);
  assert.match(summarySource, /communication_type", "convention_signature"/);
  assert.doesNotMatch(summarySource, /const sentAt = .*created_at/);
  assert.match(summaryComponent, /Envoi : \{frDateTime\(item\.sent_at\)\}/);
});

test("les inscriptions abandonnées sont exclues du récapitulatif actif", () => {
  assert.match(summarySource, /status !== "abandoned"/);
});
