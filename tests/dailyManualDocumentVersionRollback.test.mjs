import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../app/api/client/daily/manual-documents/route.ts", import.meta.url),
  "utf8",
);
const postHandler = route.split("export async function POST")[1] ?? "";

test("la régularisation manuelle distingue la dernière version de la version canonique", () => {
  assert.match(
    postHandler,
    /const \[latestResult, currentResult\] = await Promise\.all\(\[[\s\S]*order\("version", \{ ascending: false \}\)\.limit\(1\),[\s\S]*\.eq\("is_current", true\)\.order\("version", \{ ascending: false \}\)\.limit\(1\)/,
  );
  assert.match(postHandler, /const version = Number\(latest\?\.version \?\? 0\) \+ 1;/);
  assert.match(postHandler, /previous_document_id: current\?\.id \?\? latest\?\.id \?\? null/);
});

test("un échec de remplacement ne réactive qu'une version qui était réellement courante", () => {
  assert.match(
    postHandler,
    /if \(current\) \{[\s\S]*update\(\{ is_current: false,[\s\S]*\.eq\("organisation_id", context\.organisationId\)[\s\S]*\.eq\("is_current", true\);/,
  );
  assert.match(
    postHandler,
    /if \(supersedeError\) \{[\s\S]*storage\.from\("documents"\)\.remove\(\[storagePath\]\);[\s\S]*return NextResponse\.json/,
  );
  assert.match(
    postHandler,
    /if \(error \|\| !document\) \{[\s\S]*if \(current\?\.id\) \{[\s\S]*update\(\{ is_current: true, updated_by: context\.user\.id \}\)[\s\S]*\.eq\("organisation_id", context\.organisationId\)/,
  );
  assert.doesNotMatch(postHandler, /if\s*\(latest\?\.id\)[\s\S]*is_current:\s*true/);
});
