import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/daily-portal/[token]/program-pdf/route.ts", import.meta.url), "utf8");
const portal = await readFile(new URL("../app/api/daily-portal/[token]/route.ts", import.meta.url), "utf8");

test("imported program link is visible in private learner portal", () => {
  assert.match(portal, /\["selen_form","program_import"\]\.includes/);
});
test("imported program requires active learner and validated formation", () => {
  assert.match(route, /if \(!matched\)/);
  assert.match(route, /formation\.status !== "validated"/);
  assert.match(route, /formation\.creation_mode === "program_import"/);
});
test("imported source must be a current scoped program source", () => {
  assert.match(route, /positioningSourceDocumentId\(formation\.detailed_program_document_url\)/);
  assert.match(route, /\.eq\("organisation_id", session\.organisation_id\)/);
  assert.match(route, /\.eq\("document_type", "training_program_source"\)/);
  assert.match(route, /!source\.is_current/);
  assert.match(route, /personalSignatureStorageObjectPath\(source\?\.storage_path, session\.organisation_id\)/);
  assert.match(route, /source\.formation_id && source\.formation_id !== formation\.id/);
  assert.match(route, /source\.bucket !== "documents"/);
});
test("imported source uses a short-lived private signed download", () => {
  assert.match(route, /createSignedUrl\(storagePath, 120, \{ download: true \}\)/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
});
