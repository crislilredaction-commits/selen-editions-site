import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("P0 portal components remount for a new role or token", async () => {
  const source = await read("app/daily/portail/[role]/[token]/page.tsx");
  assert.match(source, /key=\{/);
  assert.match(source, /learner:\$\{role\}:\$\{token\}/);
  assert.match(source, /workspace:\$\{role\}:\$\{token\}/);
});

for (const path of ["components/daily/DailyStakeholderWorkspace.tsx", "components/daily/LearnerPhaseNavigation.tsx"]) {
  test("P0 " + path + " clears sensitive data and aborts outdated requests", async () => {
    const source = await read(path);
    assert.match(source, /setData\(null\)/);
    assert.match(source, /setResources\(\[\]\)/);
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /signal\??\.aborted/);
    assert.match(source, /controller\.abort\(\)/);
    assert.match(source, /portalType/);
  });
  test("P0 " + path + " exposes document failures rather than empty success", async () => {
    const source = await read(path);
    assert.match(source, /setResourcesError\("Les documents sont temporairement indisponibles/);
    assert.match(source, /resourcesError \? <p role="alert"/);
    assert.match(source, /resourcesError \? "Vérification des documents temporairement indisponible/);
  });
}

test("P0 optional trainer follow-up failure does not fail the entire portal", async () => {
  const source = await read("components/daily/DailyStakeholderWorkspace.tsx");
  assert.match(source, /setFollowupError\("Le suivi de session est temporairement indisponible/);
  assert.match(source, /followup.*\.catch\(\(\) =>/);
});
