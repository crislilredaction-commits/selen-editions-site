import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/client/daily/documents-fin/page.tsx", import.meta.url), "utf8");

test("Après montre l’avancement mais ne propose les actions qu’après publication Studio", () => {
  assert.match(page, /const publishedStatuses=new Set\(\["published","signed"\]\)/);
  assert.match(page, /const isPublished=publishedStatuses\.has\(doc\.status\)/);
  assert.match(page, /Publication Selen en attente : le téléchargement et l’envoi restent fermés/);
  assert.match(page, /\{isPublished\?<a href=\{`\/api\/client\/daily\/posttraining-documents\/download/);
  assert.match(page, /const canSend=doc\.document_type==="completion_certificate"&&isPublished/);
  assert.doesNotMatch(page, /new Set\(\[[^\]]*"validated"/);
});
