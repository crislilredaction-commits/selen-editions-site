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
    /Array\.isArray\(session\.daily_conventions\)[\s\S]*session\.daily_conventions = session\.daily_conventions\.filter\(\(document: \{ status: string \}\) => document\.status === "generated"\)/,
  );
  assert.match(
    getHandler,
    /Array\.isArray\(session\.daily_convocations\)[\s\S]*session\.daily_convocations = session\.daily_convocations\.filter\(\(document: \{ status: string \}\) => \["generated", "sent", "viewed"\]\.includes\(document\.status\)\)/,
  );
});

test("le filtrage de lecture conserve le bornage organisme et l'historique", () => {
  assert.match(
    getHandler,
    /\.from\("daily_sessions"\)[\s\S]*\.eq\("organisation_id", context\.organisationId\)[\s\S]*const sessions = data \?\? \[\];/,
  );
  assert.doesNotMatch(getHandler, /\.delete\(|\.update\(|\.upsert\(|\.insert\(/);
  assert.ok(getHandler.indexOf("const sessions = data ?? [];") < getHandler.lastIndexOf("NextResponse.json({ sessions })"));
});
