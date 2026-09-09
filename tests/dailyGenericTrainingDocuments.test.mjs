import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("app/client/daily/generateur-documents/page.tsx", "utf8");

test("Daily generates one combined convocation welcome booklet and rules PDF", () => {
  assert.match(source, /03_Convocation_Livret_Accueil_Reglement_Interieur\.pdf/);
  assert.match(source, /newSectionPage\(doc,"Livret d'accueil"/);
  assert.match(source, /newSectionPage\(doc,"Règlement intérieur"/);
});

test("welcome pack adapts to the four supported delivery modes", () => {
  for (const marker of ["Formation en présentiel", "Classe virtuelle / distanciel synchrone", "Formation à distance / e-learning", "Formation hybride"]) {
    assert.ok(source.includes(marker), `missing modality: ${marker}`);
  }
  assert.match(source, /distance_mode/);
  assert.match(source, /blended_elearning_periods/);
  assert.match(source, /blended_in_person_days/);
});

test("welcome and rules content includes accessibility, follow-up and update trace", () => {
  assert.match(source, /Besoin particulier \/ accessibilité/);
  assert.match(source, /Déroulement et suivi/);
  assert.match(source, /Enregistrements et confidentialité/);
  assert.match(source, /Supports et propriété intellectuelle/);
  assert.match(source, /Actualisation/);
});
