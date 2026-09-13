import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const login = readFileSync(new URL("../app/client/login/page.tsx", import.meta.url), "utf8");
const forgot = readFileSync(new URL("../app/client/mot-de-passe-oublie/page.tsx", import.meta.url), "utf8");
const update = readFileSync(new URL("../app/client/nouveau-mot-de-passe/page.tsx", import.meta.url), "utf8");
const clientDashboard = readFileSync(new URL("../app/client/page.tsx", import.meta.url), "utf8");
const supabaseClient = readFileSync(new URL("../app/lib/supabase/client.ts", import.meta.url), "utf8");

test("la connexion expose un accès mot de passe oublié", () => {
  assert.match(login, /Mot de passe oublié \?/);
  assert.match(login, /href="\/client\/mot-de-passe-oublie"/);
});

test("la demande de récupération utilise Supabase avec un retour Selen explicite", () => {
  assert.match(forgot, /resetPasswordForEmail\(normalizedEmail, \{ redirectTo \}\)/);
  assert.match(forgot, /\/client\/nouveau-mot-de-passe/);
  assert.match(forgot, /Si un compte Selen correspond à cette adresse/);
});

test("le nouveau mot de passe exige une session et met à jour l'utilisateur authentifié", () => {
  assert.match(update, /detectSessionInUrl: false/);
  assert.match(update, /isSingleton: false/);
  assert.match(update, /exchangeCodeForSession\(code\)/);
  assert.match(update, /setSession\(\{/);
  assert.match(update, /getSession\(\)/);
  assert.match(update, /PASSWORD_RECOVERY/);
  assert.match(update, /updateUser\(\{ password \}\)/);
  assert.match(update, /password\.length < 8/);
  assert.match(update, /password !== confirmation/);
});

test("le retour Supabase historique vers le Bureau est redirigé vers le changement de mot de passe", () => {
  assert.match(clientDashboard, /detectSessionInUrl: false/);
  assert.match(clientDashboard, /isSingleton: false/);
  assert.match(clientDashboard, /exchangeCodeForSession\(recoveryCode\)/);
  assert.match(clientDashboard, /hashParams\.get\("type"\) === "recovery"/);
  assert.match(clientDashboard, /router\.replace\("\/client\/nouveau-mot-de-passe"\)/);
});

test("le client de récupération permet de désactiver l'échange automatique PKCE", () => {
  assert.match(supabaseClient, /detectSessionInUrl\?: boolean/);
  assert.match(supabaseClient, /isSingleton\?: boolean/);
});
