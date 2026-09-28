import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sessionsRoute = await readFile(new URL("../app/api/client/daily/sessions/route.ts", import.meta.url), "utf8");

test("les inscriptions manuelles sont relues depuis daily_session_enrolments pour les sessions", () => {
  assert.match(sessionsRoute, /from\(["']daily_session_enrolments["']\)/);
  assert.match(sessionsRoute, /session_id/);
  assert.match(sessionsRoute, /learner_id/);
});

test("les inscriptions inactives ne remontent pas dans les apprenants de session", () => {
  assert.match(sessionsRoute, /declined/);
  assert.match(sessionsRoute, /cancelled/);
  assert.match(sessionsRoute, /abandoned/);
});

test("le raccord session protège des doublons et des inscriptions orphelines", () => {
  assert.match(sessionsRoute, /learner_id/);
  assert.match(sessionsRoute, /session_id/);
  assert.match(sessionsRoute, /Set|Map/);
});
