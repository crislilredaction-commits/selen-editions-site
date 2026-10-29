import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Avant formation exclut les conventions et convocations historiques", async () => {
  const [convention, convocation] = await Promise.all([
    read("app/api/client/daily/conventions/download/route.ts"),
    read("app/api/client/daily/convocations/download/route.ts"),
  ]);

  const conventionLookup = convention.split('.from("daily_conventions")')[1] ?? "";
  assert.match(
    conventionLookup,
    /\.eq\("id",\s*id\)[\s\S]*\.eq\("status",\s*"generated"\)[\s\S]*\.maybeSingle\(\)/,
  );
  assert.doesNotMatch(conventionLookup, /"superseded"|"archived"/);

  const convocationLookup = convocation.split('.from("daily_convocations")')[1] ?? "";
  assert.match(
    convocationLookup,
    /\.eq\("id",\s*id\)[\s\S]*\.in\("status",\s*\["generated",\s*"sent",\s*"viewed"\]\)[\s\S]*\.maybeSingle\(\)/,
  );
  assert.doesNotMatch(convocationLookup, /"archived"/);
});

test("les téléchargements restent bornés à l'organisme avant tout lien signé", async () => {
  const sources = await Promise.all([
    read("app/api/client/daily/conventions/download/route.ts"),
    read("app/api/client/daily/convocations/download/route.ts"),
  ]);

  for (const source of sources) {
    assert.match(source, /getDailyOrganisationContext\(req, "sessions", \{ allowAssistanceRead: true \}\)/);
    assert.match(
      source,
      /\.from\("daily_sessions"\)[\s\S]*\.eq\("organisation_id", context\.organisationId\)[\s\S]*createSignedUrl/,
    );
    assert.ok(source.indexOf('daily_sessions') < source.indexOf("createSignedUrl"));
    assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.upload\(/);
  }
});
