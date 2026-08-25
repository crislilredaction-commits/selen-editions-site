import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
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

function firstPrivilegedOperationIndex(source) {
  return [
    source.search(/\.from\s*\(/),
    source.search(/\.storage\b/),
    source.search(/\.rpc\s*\(/),
  ]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? -1;
}

async function listRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listRouteFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name === "route.ts") {
      files.push(entryPath.split(path.sep).join("/"));
    }
  }

  return files;
}

for (const routePath of dossierScopedRoutes) {
  test(`${routePath} conserve le garde d'accès NDA serveur avant toute opération privilégiée`, async () => {
    const source = await readFile(routePath, "utf8");

    assert.match(source, /getAdminSupabase/);
    assert.match(source, /verifyClientNdaDossierAccess/);
    assert.match(source, /await\s+verifyClientNdaDossierAccess\s*\(/);
    assert.match(source, /if\s*\(!access\.ok\)/);

    const accessCallIndex = source.search(
      /await\s+verifyClientNdaDossierAccess\s*\(/,
    );
    const accessFailureIndex = source.search(/if\s*\(!access\.ok\)/);
    const privilegedOperationIndex = firstPrivilegedOperationIndex(source);

    assert.ok(accessCallIndex >= 0, "le contrôle d'accès doit être appelé");
    assert.ok(
      accessFailureIndex > accessCallIndex,
      "l'échec du contrôle d'accès doit être traité après son exécution",
    );

    if (privilegedOperationIndex >= 0) {
      assert.ok(
        privilegedOperationIndex > accessFailureIndex,
        "aucune opération Supabase privilégiée ne doit précéder le refus d'accès",
      );
    }
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

test("toutes les routes client qui utilisent les gardes NDA canoniques restent couvertes", async () => {
  const routeFiles = await listRouteFiles("app/api/client");
  const guardedDossierRoutes = [];
  const guardedListRoutes = [];

  for (const routePath of routeFiles) {
    const source = await readFile(routePath, "utf8");

    if (/await\s+verifyClientNdaDossierAccess\s*\(/.test(source)) {
      guardedDossierRoutes.push(routePath);
    }

    if (/await\s+listClientNdaDossiers\s*\(/.test(source)) {
      guardedListRoutes.push(routePath);
    }
  }

  assert.deepEqual(
    guardedDossierRoutes.sort(),
    [...dossierScopedRoutes].sort(),
    "une route utilisant verifyClientNdaDossierAccess a été ajoutée ou retirée sans mise à jour explicite du gate NDA",
  );

  assert.deepEqual(
    guardedListRoutes.sort(),
    [...listRoutes].sort(),
    "une route utilisant listClientNdaDossiers a été ajoutée ou retirée sans mise à jour explicite du gate NDA",
  );
});
