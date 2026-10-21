import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../app/api/client/daily/sessions/route.ts", import.meta.url),
  "utf8",
);
const getHandler = route.split("export async function GET")[1]?.split("export async function POST")[0] ?? "";

test("la liste des sessions n'expose que les pièces préformation canoniques", () => {
  assert.match(
    getHandler,
    /daily_conventions\(id,[^)]*status[^)]*,daily_convention_signatures/,
  );
  assert.match(
    getHandler,
    /daily_convocations\(id,[^)]*status[^)]*\)/,
  );
  assert.match(
    getHandler,
    /daily_conventions:\s*\(session\.daily_conventions \?\? \[\]\)\.filter\(\(document\) => document\.status === "generated"\)/,
  );
  assert.match(
    getHandler,
    /daily_convocations:\s*\(session\.daily_convocations \?\? \[\]\)\.filter\(\(document\) => \["generated", "sent", "viewed"\]\.includes\(document\.status\)\)/,
  );
});

test("le filtrage de lecture conserve le bornage organisme et l'historique", () => {
  assert.match(
    getHandler,
    /\.from\("daily_sessions"\)[\s\S]*\.eq\("organisation_id", context\.organisationId\)[\s\S]*const sessions = \(data \?\? \[\]\)\.map/,
  );
  assert.doesNotMatch(getHandler, /\.delete\(|\.update\(|\.upsert\(|\.insert\(/);
  assert.ok(getHandler.indexOf("const sessions = (data ?? []).map") < getHandler.lastIndexOf("NextResponse.json({ sessions })"));
});
