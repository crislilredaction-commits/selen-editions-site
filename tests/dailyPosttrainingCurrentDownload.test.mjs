import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Après ne signe que la version canonique courante et non archivée", async () => {
  const route = await read("app/api/client/daily/posttraining-documents/download/route.ts");

  assert.match(route, /getDailyOrganisationContext\(req, "sessions", \{ allowAssistanceRead: true \}\)/);
  assert.match(route, /\.eq\("id", id\)/);
  assert.match(route, /\.eq\("organisation_id", context\.organisationId\)/);
  assert.match(route, /\.in\("document_type", \["attendance_summary", "completion_certificate"\]\)/);
  assert.match(route, /\.eq\("is_current", true\)/);
  assert.match(route, /\.is\("archived_at", null\)/);
  assert.ok(route.indexOf('.eq("is_current", true)') < route.indexOf("createSignedUrl"));
  assert.ok(route.indexOf('.is("archived_at", null)') < route.indexOf("createSignedUrl"));
  assert.match(route, /createSignedUrl\(document\.storage_path, 120\)/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.upload\(/);
});
