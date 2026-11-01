import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/daily-portal/[token]/followup/route.ts", import.meta.url), "utf8");

test("P0: le suivi formateur refuse tout état de jeton non explicitement actif avant de lire la session", () => {
  const guard = 'if (!["pending", "viewed"].includes(String(access.status ?? "")))';
  const tokenRead = route.indexOf('.from("daily_portal_access_tokens")');
  const sessionRead = route.indexOf('.from("daily_sessions")');
  const guardIndex = route.indexOf(guard);
  assert.ok(tokenRead >= 0 && guardIndex > tokenRead && sessionRead > guardIndex);
  assert.doesNotMatch(route, /\["revoked", "expired"\]\.includes\(String\(access\.status/);
});

test("P0: seuls pending et viewed sont autorisés, les états inconnus échouent fermés", () => {
  const expression = route.match(/if \((!\["pending", "viewed"\]\.includes\(String\(access\.status \?\? ""\)\))\) return/);
  assert.ok(expression, "le garde de statut doit être explicite");
  const rejected = new Function("access", `return ${expression[1]};`);
  for (const status of ["pending", "viewed"]) assert.equal(rejected({ status }), false, status);
  for (const status of ["revoked", "expired", "suspended", "used", "unknown", "", null, undefined]) {
    assert.equal(rejected({ status }), true, String(status));
  }
});

test("P0: GET, POST et PATCH passent tous par le même garde formateur", () => {
  for (const method of ["GET", "POST", "PATCH"]) {
    const start = route.indexOf(`export async function ${method}(`);
    assert.ok(start >= 0, `${method} doit exister`);
    const next = route.indexOf("export async function ", start + 1);
    const body = route.slice(start, next < 0 ? undefined : next);
    assert.match(body, /trainerAccess\(text\(token\)\)/);
    assert.match(body, /if \(!auth\.ok\) return portalResponse/);
  }
});
