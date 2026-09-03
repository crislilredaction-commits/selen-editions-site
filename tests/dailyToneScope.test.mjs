import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const guard = await readFile(
  new URL("../components/ClientVouvoiementGuard.tsx", import.meta.url),
  "utf8",
);

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
