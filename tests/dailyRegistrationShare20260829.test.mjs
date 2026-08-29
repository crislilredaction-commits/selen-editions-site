import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("le lien court redirige vers le dossier d'inscription", () => {
  const route = read("app/i/[token]/route.ts");
  assert.match(route, /daily-inscription/);
  assert.match(route, /307/);
});

test("le client dispose du lien court et du QR code", () => {
  const page = read("app/client/daily/liens-inscription/page.tsx");
  assert.match(page, /Lien court/);
  assert.match(page, /Copier le lien/);
  assert.match(page, /Télécharger le QR code/);
  assert.match(page, /J'ai intégré ce lien/);
});

test("les outils d'inscription sont visibles directement depuis les formations", () => {
  const page = read("app/client/daily/formations/page.tsx");
  const tools = read("components/daily/DailyRegistrationTools.tsx");
  assert.match(page, /DailyRegistrationTools/);
  assert.match(tools, /Liens et QR codes de vos formations validées/);
  assert.match(tools, /Copier le lien/);
  assert.match(tools, /Télécharger le QR code/);
});

test("À faire remonte la diffusion après validation", () => {
  const api = read("app/api/client/daily/action-center/route.ts");
  const page = read("app/client/daily/a-faire/page.tsx");
  assert.match(api, /spontaneous_registration_task_status/);
  assert.match(api, /kind:"registration"/);
  assert.match(page, /Liens d'inscription/);
  assert.match(page, /Voir le lien et le QR code/);
});

test("le côté client masque le vocabulaire Studio et les retours internes", () => {
  const guard = read("components/ClientVouvoiementGuard.tsx");
  assert.match(guard, /\["Selen Studio", "Selen"\]/);
  assert.match(guard, /Corrections demandées/);
  assert.match(guard, /paragraph\.remove\(\)/);
});

test("la veille client affiche la synthèse Selen en vouvoiement", () => {
  const page = read("app/client/daily/qualite/page.tsx");
  assert.match(page, /Points importants & pistes proposées par Selen/);
  assert.match(page, /Cette veille vous intéresse/);
  assert.match(page, /Ce que vous avez retenu/);
});

test("le bandeau Daily utilise le vouvoiement", () => {
  const banner = read("components/daily/DailyFriendlyBanner.tsx");
  assert.match(banner, /Votre espace avance avec vous/);
  assert.match(banner, /Vous n'avez pas besoin/);
});
