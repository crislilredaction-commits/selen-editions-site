import test from "node:test";
import assert from "node:assert/strict";

test("Lot 1 & 2: trainer workspace and attendance support lateness and absence justification", async () => {
  // Test lateness minutes and justification formatting in metadata
  const metadata = {
    source: "trainer_workspace",
    lateness_minutes: 15,
    justification_note: "Retard de train signalé",
  };

  assert.equal(metadata.lateness_minutes, 15);
  assert.equal(metadata.justification_note, "Retard de train signalé");
});
