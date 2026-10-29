import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientDashboard = await readFile(
  new URL("../app/client/page.tsx", import.meta.url),
  "utf8",
);

test("le bureau client conserve une déconnexion explicite", () => {
  assert.match(clientDashboard, /<span>Se déconnecter<\/span>/);
  assert.match(clientDashboard, /await supabase\.auth\.signOut\(\)/);
});

test("le paramétrage initial n'est plus proposé comme raccourci courant après activation Daily", () => {
  assert.doesNotMatch(clientDashboard, /Paramètres initiaux/);
  assert.doesNotMatch(clientDashboard, /daily\/onboarding\?step=1/);
  assert.match(clientDashboard, /Accéder à Selen Daily/);
});
