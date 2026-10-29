import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/server/notifyClientVisibleDocuments.ts", import.meta.url),
  "utf8",
);

test("la notification document réutilise le contenu personnalisé dans le HTML", () => {
  assert.match(source, /const htmlBody = escapeHtml\(body\)\.replaceAll\("\\n", "<br \/>"\)/);
  assert.match(source, /<p>\$\{htmlBody\}<\/p>/);
});

test("le contenu personnalisé et l'URL sont échappés avant insertion HTML", () => {
  assert.match(source, /function escapeHtml\(value: string\)/);
  assert.match(source, /escapeHtml\(dossierUrl\)/);
});
