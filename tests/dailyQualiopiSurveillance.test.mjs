import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/client/daily/quality-settings/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/client/daily/qualiopi/page.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/client/daily/layout.tsx", import.meta.url), "utf8");

test("la date de surveillance est lue depuis l'organisme canonique", () => {
  assert.match(route, /qualiopi_surveillance_audit_date/);
  assert.match(route, /qualiopi_surveillance_window_start/);
  assert.match(route, /qualiopi_surveillance_window_end/);
  assert.match(route, /required: status === "certified"/);
});

test("la date saisie doit rester dans la fenêtre Qualiopi", () => {
  assert.match(route, /auditDate < qualiopi\.surveillanceWindowStart/);
  assert.match(route, /auditDate > qualiopi\.surveillanceWindowEnd/);
  assert.match(page, /min=\{settings\.qualiopiSurveillanceWindowStart \?\? undefined\}/);
  assert.match(page, /max=\{settings\.qualiopiSurveillanceWindowEnd \?\? undefined\}/);
});

test("la saisie déclenche une tâche pré-audit idempotente sans réinitialiser son ancienneté", () => {
  assert.match(route, /\.eq\("source_type", "qualiopi_preaudit"\)/);
  assert.match(route, /\.in\("status", \["open", "planned"\]\)/);
  assert.match(route, /if \(activeTask\)/);
  assert.match(route, /\.update\(taskValues\)\.eq\("id", activeTask\.id\)/);
  assert.doesNotMatch(route, /activeTask[\s\S]*created_at:/);
});

test("le suivi Qualiopi reste un raccourci contextuel et ne recrée pas la barre d'onglets", () => {
  assert.match(layout, /pathname === "\/client\/daily\/qualite"/);
  assert.match(layout, /href: "\/client\/daily\/qualiopi"/);
  assert.doesNotMatch(layout, /<nav/);
});
