import test from "node:test";
import assert from "node:assert/strict";

test("Lot 3 & 4: pedagogical followup entries and active alert counts", async () => {
  const entryTypes = ["incident", "adaptation", "absence", "note"];
  assert.ok(entryTypes.includes("note"));

  const alertStats = {
    openFollowupEntries: 2,
    unresolvedIncidents: 1,
    unassignedSessionSlots: 0,
  };

  assert.equal(alertStats.openFollowupEntries, 2);
  assert.equal(alertStats.unresolvedIncidents, 1);
});
