import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dossierScopedRoutes = [
  "app/api/client/documents/download/route.ts",
  "app/api/client/dossier/state/route.ts",
  "app/api/client/dossier/step-1/route.ts",
  "app/api/client/dossier/step-2/route.ts",
  "app/api/client/dossier/final-upload/route.ts",
  "app/api/client/messages/list/route.ts",
  "app/api/client/messages/read-client/route.ts",
  "app/api/client/messages/send/route.ts",
  "app/api/client/nda/deposit-submitted/route.ts",
  "app/api/client/nda/final-documents-submitted/route.ts",
  "app/api/client/nda/refusal-letter/route.ts",
  "app/api/client/program/decision/route.ts",
  "app/api/client/program/download/route.ts",
  "app/api/client/program/latest/route.ts",
  "app/api/client/program/validate/route.ts",
  "app/api/client/upload/route.ts",
];

const listRoutes = ["app/api/client/nda-dossiers/route.ts"];

for (const routePath of dossierScopedRoutes) {
  test(`${routePath} conserve le garde d'accès NDA serveur`, async () => {
    const source = await readFile(routePath, "utf8");

    assert.match(source, /getAdminSupabase/);
    assert.match(source, /verifyClientNdaDossierAccess/);
    assert.match(source, /await\s+verifyClientNdaDossierAccess\s*\(/);
    assert.match(source, /if\s*\(!access\.ok\)/);
  });
}

for (const routePath of listRoutes) {
  test(`${routePath} conserve le garde de liste NDA serveur`, async () => {
    const source = await readFile(routePath, "utf8");

    assert.match(source, /getAdminSupabase/);
    assert.match(source, /listClientNdaDossiers/);
    assert.match(source, /await\s+listClientNdaDossiers\s*\(/);
    assert.match(source, /if\s*\(!result\.ok\)/);
  });
}
