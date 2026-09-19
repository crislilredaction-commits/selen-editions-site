import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync("app/client/daily/formations/page.tsx", "utf8");
const manager = fs.readFileSync("components/daily/DailyFormationsManager.tsx", "utf8");

test("formation creation mode reaches the canonical manager", () => {
  assert.match(page, /program_import/);
  assert.match(page, /selen_form/);
  assert.match(page, /DailyFormationsManager creationMode=/);
  assert.match(manager, /creationMode\?: "program_import" \| "selen_form"/);
  assert.match(manager, /creation_mode: creationMode \?\? "selen_form"/);
});

test("program import mode keeps the original programme as the starting point", () => {
  assert.match(manager, /Programme importé/);
  assert.match(manager, /programme original/);
  assert.match(manager, /ne doivent pas être ressaisis inutilement/);
});
