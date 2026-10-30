import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isActivePortalAttendanceToken } from "../lib/daily/portalAttendanceAccess.mjs";

const now = Date.parse("2026-10-29T18:40:00.000Z");

for (const status of ["pending", "viewed"]) {
  test(`un accès ${status} reste autorisé avec une échéance future ou absente`, () => {
    assert.equal(isActivePortalAttendanceToken(status, "2026-10-30T18:40:00.000Z", now), true);
    assert.equal(isActivePortalAttendanceToken(status, null, now), true);
  });
  test(`un accès ${status} est refusé si son échéance est passée, immédiate ou illisible`, () => {
    for (const expiry of ["2026-10-28T18:40:00.000Z", "2026-10-29T18:40:00.000Z", "date-invalide", "", " ", 1234, NaN, "9999", "2030", "12/31/9999", "2030-02-30T00:00:00Z", "2030-01-01T00:00:00"]) {
      assert.equal(isActivePortalAttendanceToken(status, expiry, now), false, `expiry=${String(expiry)}`);
    }
  });
}

for (const status of ["revoked", "expired", "suspended", "sent", "", null, undefined]) {
  test(`un statut ${String(status)} est refusé, même avec une date future`, () => {
    assert.equal(isActivePortalAttendanceToken(status, "2027-01-01T00:00:00.000Z", now), false);
  });
}

test("les deux parcours d'émargement appliquent le même garde avant toute lecture métier", async () => {
  const base = new URL("../app/api/daily-portal/[token]/", import.meta.url);
  for (const name of ["attendance", "late-attendance"]) {
    const route = await readFile(new URL(`${name}/route.ts`, base), "utf8");
    assert.match(route, /isActivePortalAttendanceToken\(access\.status, access\.expires_at\)/);
    assert.ok(route.indexOf("isActivePortalAttendanceToken(access.status, access.expires_at)") < route.indexOf('from("daily_sessions")'));
  }
});

test("les dates ISO valides avec décalage et les jours bissextiles restent acceptés", () => {
  assert.equal(isActivePortalAttendanceToken("pending", "2030-01-01T00:00:00.123456+01:00", now), true);
  assert.equal(isActivePortalAttendanceToken("viewed", "2028-02-29T12:00:00Z", now), true);
  assert.equal(isActivePortalAttendanceToken("pending", "2030-02-29T12:00:00Z", now), false);
});


test("les espaces publics apprenant, formateur et entreprise partagent le garde ISO strict avant les lectures privées", async () => {
  const base = new URL("../app/api/daily-portal/[token]/", import.meta.url);
  for (const [path, firstPrivateRead] of [
    ["route.ts", "const[sessionR"],
    ["resources/route.ts", 'from("daily_sessions")'],
    ["followup/route.ts", 'from("daily_sessions")'],
  ]) {
    const source = await readFile(new URL(path, base), "utf8");
    const guard = source.indexOf("isValidPortalExpiry(access.expires_at)");
    assert.ok(guard > 0, path + " must validate the complete timestamp");
    assert.ok(guard < source.indexOf(firstPrivateRead), path + " must reject before private session reads");
    assert.doesNotMatch(source, /function isExpired(?:PortalAccess)?\(/, path);
  }
});
