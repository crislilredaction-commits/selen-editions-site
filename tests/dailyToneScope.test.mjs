import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const guard = await readFile(
  new URL("../components/ClientVouvoiementGuard.tsx", import.meta.url),
  "utf8",
);

const publicDailySources = await Promise.all([
  "../app/daily-inscription/[token]/page.tsx",
  "../app/daily-satisfaction/[token]/page.tsx",
  "../components/daily/DailyStakeholderWorkspace.tsx",
  "../app/daily/portail/[role]/[token]/layout.tsx",
].map((path) => readFile(new URL(path, import.meta.url), "utf8")));

const informalSecondPerson = /\b(?:tu|ton|ta|tes|toi)\b|(?:^|[\s"'{(])t['’]/i;

test("le garde de vouvoiement ne réécrit que l'espace Selen Daily", () => {
  assert.match(guard, /const DAILY_PATH_PREFIX = "\/client\/daily"/);
  assert.match(guard, /const pathname = usePathname\(\)/);
  assert.match(guard, /if \(!pathname\.startsWith\(DAILY_PATH_PREFIX\)\) return/);
  assert.match(guard, /\}, \[pathname\]\)/);
});

test("le garde conserve les normalisations de ton Daily existantes", () => {
  assert.match(guard, /Votre espace Daily est prêt à démarrer/);
  assert.match(guard, /Vous pourrez modifier ces informations plus tard/);
  assert.match(guard, /Continuez à transmettre les informations/);
});

test("les parcours publics Daily restent au vouvoiement sans réécriture DOM", () => {
  for (const source of publicDailySources) {
    assert.doesNotMatch(source, informalSecondPerson);
  }

  assert.match(publicDailySources[0], /Préparons votre entrée en formation/);
  assert.match(publicDailySources[0], /Vous serez recontacté\(e\) par téléphone/);
  assert.match(publicDailySources[1], /Votre retour nous aide à améliorer concrètement/);
  assert.match(publicDailySources[2], /Retrouvez ici uniquement les informations et actions qui vous concernent/);
  assert.match(publicDailySources[3], /Besoin d’agir depuis votre espace \?/);
});
