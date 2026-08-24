import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const protectedRoutes = [
  "app/api/client/dossier/state/route.ts",
  "app/api/client/dossier/step-1/route.ts",
  "app/api/client/dossier/step-2/route.ts",
  "app/api/client/dossier/final-upload/route.ts",
  "app/api/client/messages/list/route.ts",
  "app/api/client/messages/read-client/route.ts",
  "app/api/client/messages/send/route.ts",
  "app/api/client/program/decision/route.ts",
  "app/api/client/program/download/route.ts",
  "app/api/client/program/latest/route.ts",
  "app/api/client/program/validate/route.ts",
  "app/api/client/documents/download/route.ts",
  "app/api/client/upload/route.ts",
  "app/api/client/nda/deposit-submitted/route.ts",
  "app/api/client/nda/final-documents-submitted/route.ts",
  "app/api/client/nda/refusal-letter/route.ts",
];

test("le helper NDA garde les donnees historiques derriere une verification serveur", async () => {
  const helper = await source("lib/server/clientNdaAccess.ts");

  assert.match(helper, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(helper, /auth\.getUser\(\)/);
  assert.match(helper, /dossier\.type\s*!==\s*"nda"/);
  assert.match(helper, /organisation\.email/);
  assert.match(helper, /userEmail/);
});

test("la liste des dossiers NDA passe par le helper serveur dedie", async () => {
  const route = await source("app/api/client/nda-dossiers/route.ts");

  assert.match(route, /getAdminSupabase/);
  assert.match(route, /listClientNdaDossiers/);
});

test("les routes historiques NDA critiques ne reviennent pas a un acces navigateur direct", async () => {
  const failures = [];

  for (const path of protectedRoutes) {
    const route = await source(path);
    const usesAdmin = route.includes("getAdminSupabase");
    const verifiesDossier = route.includes("verifyClientNdaDossierAccess");

    if (!usesAdmin || !verifiesDossier) {
      failures.push(`${path}: admin=${usesAdmin}, verification=${verifiesDossier}`);
    }
  }

  assert.deepEqual(failures, []);
});

test("les mutations NDA sensibles restent interdites en mode assistance agent", async () => {
  const routes = [
    "app/api/client/nda/deposit-submitted/route.ts",
    "app/api/client/nda/final-documents-submitted/route.ts",
    "app/api/client/nda/refusal-letter/route.ts",
  ];

  for (const path of routes) {
    const route = await source(path);
    assert.match(route, /access\.mode\s*===\s*"agent_assistance"/);
    assert.match(route, /blockedAgentAssistanceResponse/);
  }
});
