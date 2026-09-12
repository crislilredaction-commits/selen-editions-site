import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layout = readFileSync(new URL("../app/client/daily/layout.tsx", import.meta.url), "utf8");

test("Lot 2 expose l’espace organisme dans l’en-tête Daily", () => {
  assert.match(layout, /href="\/client\/daily\/organisation"/);
  assert.match(layout, />Mon organisme</);
});

test("Lot 2 fournit une navigation contextuelle cohérente pour l’espace organisme", () => {
  assert.match(layout, /isOrganisationSection/);
  assert.match(layout, /Espace organisme/);
  assert.match(layout, /label: "Formateurs"/);
  assert.match(layout, /label: "Apprenants"/);
  assert.match(layout, /label: "Mon compte"/);
});

test("Lot 2 conserve des garde-fous mobiles pour l’espace organisme", () => {
  assert.match(layout, /daily-route-organisation/);
  assert.match(layout, /@media\(max-width:640px\)/);
  assert.match(layout, /overflow-x:auto/);
  assert.match(layout, /max-width:100%/);
  assert.match(layout, /white-space:normal/);
});
