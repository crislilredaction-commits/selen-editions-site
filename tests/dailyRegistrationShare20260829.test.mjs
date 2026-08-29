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

test("À faire remonte la diffusion après validation", () => {
  const api = read("app/api/client/daily/action-center/route.ts");
  const page = read("app/client/daily/a-faire/page.tsx");
  assert.match(api, /spontaneous_registration_task_status/);
  assert.match(api, /kind:"registration"/);
  assert.match(page, /Liens d'inscription/);
  assert.match(page, /Voir le lien et le QR code/);
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
