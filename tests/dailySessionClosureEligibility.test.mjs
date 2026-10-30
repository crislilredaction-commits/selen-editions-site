import assert from "node:assert/strict";
import test from "node:test";
import { isDailySessionEligibleForClosure as eligible } from "../lib/daily/sessionCompletionEligibility.mjs";

const complete = { completed: 4, expected: 4 };
const check = (overrides = {}) => eligible({
  sessionStatus: "ready", endDate: "2026-10-30",
  stats: complete, now: new Date("2026-10-30T23:30:00Z"),
  ...overrides,
});

test("a draft or archived session cannot be auto-closed even at 100%", () => {
  for (const status of ["draft", "archived", "cancelled", null, undefined]) {
    assert.equal(check({ sessionStatus: status }), false);
  }
  assert.equal(check(), true);
});

test("the dossier stays open throughout the last day in France, then closes next day", () => {
  assert.equal(check({ now: new Date("2026-10-30T22:59:59Z") }), false);
  assert.equal(check({ now: new Date("2026-10-30T23:00:00Z") }), true);
});

test("French daylight-saving change does not close a dossier prematurely", () => {
  const opts = { endDate: "2026-03-29" };
  assert.equal(check({ ...opts, now: new Date("2026-03-29T21:59:59Z") }), false);
  assert.equal(check({ ...opts, now: new Date("2026-03-29T22:00:00Z") }), true);
});

test("invalid end dates and invalid clocks fail closed", () => {
  for (const endDate of ["2026-02-30", "2026-13-01", "9999", "2026-10-30garbage", "", null]) {
    assert.equal(check({ endDate }), false);
  }
  assert.equal(check({ now: new Date("invalid") }), false);
});

test("empty, incomplete and inconsistent checklists cannot trigger closure", () => {
  for (const stats of [
    { expected: 0, completed: 0 }, { expected: 4, completed: 3 },
    { expected: 4, completed: 5 }, { expected: 4, completed: NaN },
  ]) assert.equal(check({ stats }), false);
});
