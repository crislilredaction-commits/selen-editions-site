import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/client/daily/recent-published-documents/route.ts", "utf8");
const card = readFileSync("components/daily/RecentPublishedDocumentsCard.tsx", "utf8");
const page = readFileSync("app/client/daily/page.tsx", "utf8");

test("les documents publiés sont strictement bornés à l’organisme connecté", () => {
  assert.match(route, /getDailyClientWorkspace/);
  assert.match(route, /membership\.organisation_id/);
  assert.match(route, /\.eq\("organisation_id", organisationId\)/);
  assert.match(route, /\.eq\("is_current", true\)/);
  assert.match(route, /\.not\("published_at", "is", null\)/);
});

test("le tableau de bord signale les documents publiés sans perturber un espace vide", () => {
  assert.match(page, /RecentPublishedDocumentsCard/);
  assert.match(card, /if \(documents\.length === 0\) return null/);
  assert.match(card, /Nouveaux documents disponibles/);
  assert.match(card, /\/client\/daily\/documents/);
  assert.match(card, /30 derniers jours/);
});
