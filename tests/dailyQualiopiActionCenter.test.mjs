import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/client/daily/action-center/route.ts", import.meta.url), "utf8");

test("le centre d’actions lit le statut Qualiopi depuis l’organisme canonique", () => {
  assert.match(route, /from\("organisations"\)\.select\("qualiopi_status"\)\.eq\("id",context\.organisationId\)/);
  assert.match(route, /organisation\?\.qualiopi_status===?"certified"/);
  assert.doesNotMatch(route, /onboarding\?\.qualiopi_status===?"yes"/);
});

test("les rappels Qualiopi arrivés à échéance sont limités à l’organisme courant", () => {
  assert.match(route, /from\("client_reminders"\)/);
  assert.match(route, /\.eq\("prestation_type","daily_qualiopi"\)/);
  assert.match(route, /\.eq\("prestation_id",context\.organisationId\)/);
  assert.match(route, /\.in\("status",\["ready","postponed"\]\)/);
  assert.match(route, /\.lte\("due_at",nowIso\)/);
});

test("les rappels Qualiopi deviennent des actions qualité sans modifier leur assignation", () => {
  assert.match(route, /quality:qualiopi-reminder:/);
  assert.match(route, /reminder_type===?"qualiopi_certificate_expiry"/);
  assert.match(route, /href:"\/client\/daily\/qualite"/);
});
