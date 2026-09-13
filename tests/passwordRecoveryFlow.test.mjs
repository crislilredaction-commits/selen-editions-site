import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const login = readFileSync(new URL("../app/client/login/page.tsx", import.meta.url), "utf8");
const forgot = readFileSync(new URL("../app/client/mot-de-passe-oublie/page.tsx", import.meta.url), "utf8");
const confirm = readFileSync(new URL("../app/client/confirmer-recuperation/page.tsx", import.meta.url), "utf8");
const update = readFileSync(new URL("../app/client/nouveau-mot-de-passe/page.tsx", import.meta.url), "utf8");
const clientDashboard = readFileSync(new URL("../app/client/page.tsx", import.meta.url), "utf8");
const supabaseClient = readFileSync(new URL("../app/lib/supabase/client.ts", import.meta.url), "utf8");

test("la connexion expose un accès mot de passe oublié", () => {
  assert.match(login, /Mot de passe oublié \?/);
  assert.match(login, /href="\/client\/mot-de-passe-oublie"/);
});

test("la demande de récupération utilise Supabase avec un retour Selen explicite", () => {
  assert.match(forgot, /resetPasswordForEmail\(normalizedEmail, \{ redirectTo \}\)/);
  assert.match(forgot, /\/client\/confirmer-recuperation/);
  assert.match(forgot, /Si un compte Selen correspond à cette adresse/);
});

test("la récupération conserve la même session du lien jusqu'au nouveau mot de passe", () => {
  assert.match(confirm, /searchParams\.get\("token_hash"\)/);
  assert.match(confirm, /recoveryType !== "recovery"/);
  assert.match(confirm, /window\.history\.replaceState/);
  assert.match(confirm, /createSupabaseBrowserClient\(\{/);
  assert.match(confirm, /async function handleConfirm\(\)/);
  assert.match(confirm, /verifyOtp\(\{/);
  assert.match(confirm, /token_hash: recoveryToken/);
  assert.match(confirm, /type: "recovery"/);
  assert.match(confirm, /setStatus\("password"\)/);
  assert.doesNotMatch(confirm, /router\.replace\("\/client\/nouveau-mot-de-passe"\)/);
  assert.match(confirm, /refreshSession\(\)/);
  assert.match(confirm, /updateUser\(\{ password \}\)/);
  assert.match(confirm, /password\.length < 8/);
  assert.match(confirm, /password !== confirmation/);
});

test("la récupération explique les refus Auth au lieu de les confondre avec un lien expiré", () => {
  assert.match(confirm, /case "weak_password"/);
  assert.match(confirm, /règles de sécurité/);
  assert.match(confirm, /case "same_password"/);
  assert.match(confirm, /différent de l'ancien/);
  assert.match(confirm, /case "reauthentication_needed"/);
  assert.match(confirm, /case "session_expired"/);
  assert.match(confirm, /passwordUpdateErrorMessage\(authError\)/);
  assert.match(confirm, /code : \$\{error\.code\}/);
  assert.match(confirm, /12 caractères ou plus/);
  assert.doesNotMatch(confirm, /Impossible de modifier le mot de passe\. Réessayez sans quitter cette page/);
});

test("le nouveau mot de passe historique exige une session et met à jour l'utilisateur authentifié", () => {
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
