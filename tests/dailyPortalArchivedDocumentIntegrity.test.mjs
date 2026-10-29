import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sources = await Promise.all([
  "../app/api/daily-portal/[token]/route.ts",
  "../app/api/daily-portal/[token]/resources/route.ts",
  "../app/api/daily-portal/[token]/document/route.ts",
  "../app/daily/assistance/portail/[accessId]/page.tsx",
  "../app/daily/assistance/portail/[accessId]/document/route.ts",
].map((path) => readFile(new URL(path, import.meta.url), "utf8")));

test("les listes et téléchargements de portail excluent les versions logiquement archivées", () => {
  for (const source of sources) {
    assert.match(source, /\.eq\("is_current",\s*true\)\.is\("archived_at",\s*null\)/);
  }
});

test("l’archivage logique est vérifié avant toute URL signée", () => {
  const [portal, resources, download, delegatedPortal, delegatedDownload] = sources;
  assert.match(portal, /\.is\("archived_at",null\).*\.order\("created_at"/s);
  assert.match(resources, /\.is\("archived_at", null\).*\.order\("created_at"/s);
  assert.match(download, /\.is\("archived_at",null\).*maybeSingle\(\).*createSignedUrl/s);
  assert.match(delegatedPortal, /\.is\("archived_at",null\).*\.order\("created_at"/s);
  assert.match(delegatedDownload, /\.is\("archived_at",null\).*maybeSingle\(\).*createSignedUrl/s);
});
