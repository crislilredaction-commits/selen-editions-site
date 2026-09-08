import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("le suivi annuel et ses téléversements refusent une fiche formateur désactivée", async () => {
  const sources = await Promise.all([
    read("app/api/client/daily/trainer-annual-review/route.ts"),
    read("app/api/client/daily/trainer-annual-review/cv/route.ts"),
    read("app/api/client/daily/trainer-annual-review/attestation/route.ts"),
  ]);

  for (const source of sources) {
    assert.match(source, /\.eq\("user_id", userId\)[\s\S]*?\.eq\("active", true\)[\s\S]*?\.limit\(2\)/);
    assert.match(source, /\.ilike\("professional_email", normalizedEmail\)[\s\S]*?\.eq\("active", true\)[\s\S]*?\.limit\(2\)/);
  }
});
