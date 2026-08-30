import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const learner = await readFile(new URL("../app/api/internal/daily/satisfaction-automation/route.ts", import.meta.url), "utf8");
const stakeholder = await readFile(new URL("../app/api/internal/daily/stakeholder-satisfaction-automation/route.ts", import.meta.url), "utf8");

for (const [label, source] of [["apprenants", learner], ["parties prenantes", stakeholder]]) {
  test(`${label}: deux relances seulement à J+2 et J+4`, () => {
    assert.match(source, /REMINDER_OFFSETS_DAYS = \[2, 4\] as const/);
    assert.doesNotMatch(source, /REMINDER_INTERVAL_DAYS = 3|REMINDER_DAYS = 3/);
    assert.match(source, /automation_stage/);
  });

  test(`${label}: une réponse stoppe les relances et ferme la tâche téléphone`, () => {
    assert.match(source, /satisfaction_phone_followup/);
    assert.match(source, /status: "closed"/);
    assert.match(source, /Réponse satisfaction reçue/);
  });

  test(`${label}: après J+4 une tâche téléphonique idempotente est créée`, () => {
    assert.match(source, /phoneActionBySource/);
    assert.match(source, /source_type: PHONE_FOLLOWUP_SOURCE/);
    assert.match(source, /status: "open"/);
  });
}
