import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const portal = await readFile(new URL("../app/api/daily-portal/[token]/route.ts", import.meta.url), "utf8");
const pdf = await readFile(new URL("../app/api/daily-portal/[token]/program-pdf/route.ts", import.meta.url), "utf8");
const document = await readFile(new URL("../app/api/daily-portal/[token]/document/route.ts", import.meta.url), "utf8");
const delegatedPage = await readFile(new URL("../app/daily/assistance/portail/[accessId]/page.tsx", import.meta.url), "utf8");
const delegatedDocument = await readFile(new URL("../app/daily/assistance/portail/[accessId]/document/route.ts", import.meta.url), "utf8");

test("learner portal resolves by entity key before legacy email or name fallback", () => {
  assert.match(portal, /matchesDailyLearnerPortalAccess\(access,row\)/);
});

test("private program PDF does not fall back to shared email when entity key exists", () => {
  assert.match(pdf, /matchesDailyLearnerPortalAccess\(access, row\)/);
});

test("document download and PDF use entity key first", () => {
  assert.match(document, /entityKey\?entityKey===`learner:\$\{text\(row\.learner_id\)\}`/);
  assert.match(pdf, /matchesDailyLearnerPortalAccess/);
});

test("delegated learner preview and downloads use the same canonical binding", () => {
  assert.match(delegatedPage, /matchesDailyLearnerPortalAccess\(access, row\)/);
  assert.match(delegatedDocument, /entity_key/);
  assert.match(delegatedDocument, /matchesDailyLearnerPortalAccess\(access,row\)/);
});
