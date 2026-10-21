import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Avant formation ne signe que la version canonique courante", async () => {
  const route = await read("app/api/client/daily/pretraining-documents/download/route.ts");

  assert.match(route, /getDailyOrganisationContext\(req,"sessions",\{allowAssistanceRead:true\}\)/);
  assert.match(route, /\.eq\("id",id\)\.eq\("organisation_id",context\.organisationId\)/);
  assert.match(route, /\.in\("document_type",\["training_program","training_agreement","training_contract","convocation","registration_positioning","welcome_booklet","internal_regulations"\]\)\.eq\("is_current",true\)\.single\(\)/);
  assert.ok(route.indexOf('.eq("is_current",true)') < route.indexOf("createSignedUrl"));
  assert.match(route, /if \(error \|\| !document\) return NextResponse\.json\(\{error:"Document introuvable\."\},\{status:404\}\)/);
  assert.match(route, /createSignedUrl\(document\.storage_path,120\)/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.upload\(/);
});
