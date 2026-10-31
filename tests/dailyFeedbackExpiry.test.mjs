import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as crypto from "node:crypto";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const { dailyFeedbackExpiresAt } = loadTypeScript("lib/server/dailyEndEvaluations.ts", { crypto }, { Date });
const now = new Date("2026-10-31T04:30:00.000Z");

test("P0: sending satisfaction months after session end creates a usable 30-day link", () => {
  assert.equal(dailyFeedbackExpiresAt("2026-07-01", now), "2026-11-30T04:30:00.000Z");
});

test("P0: a future session keeps the 30-day post-session window", () => {
  assert.equal(dailyFeedbackExpiresAt("2026-11-10", now), "2026-12-10T12:00:00.000Z");
});

test("P0: a session ending earlier today never creates a prematurely expiring link", () => {
  assert.equal(dailyFeedbackExpiresAt("2026-10-31", new Date("2026-10-31T18:00:00.000Z")), "2026-11-30T18:00:00.000Z");
});

test("P0: invalid and absent session end dates fall back to the creation date", () => {
  for (const endDate of [null, undefined, "", "2026-02-30", "invalid"]) {
    assert.equal(dailyFeedbackExpiresAt(endDate, now), "2026-11-30T04:30:00.000Z");
  }
});

test("P0: expiry remains stable across the French daylight-saving change", () => {
  assert.equal(dailyFeedbackExpiresAt("2026-10-24", new Date("2026-10-24T18:00:00.000Z")), "2026-11-23T18:00:00.000Z");
});

test("P0: manual link and email link both use the same expiry rule", async () => {
  for (const path of [
    "../app/api/client/daily/end-evaluations/route.ts",
    "../app/api/client/daily/end-evaluations/send-satisfaction/route.ts",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /dailyFeedbackExpiresAt\(session\.end_date\)/);
    assert.doesNotMatch(source, /expiryBase\.setUTCDate|base\.setUTCDate/);
  }
});
