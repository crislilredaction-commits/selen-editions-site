import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const route = fs.readFileSync(path.resolve("app/api/client/daily/posttraining-documents/send/route.ts"), "utf8");

test("completion certificate send route deduplicates an already sent document version", () => {
  assert.match(route, /communication_type", "completion_certificate"/);
  assert.match(route, /contains\("metadata", \{ document_id: document\.id, document_version: document\.version \}\)/);
  assert.match(route, /eq\("status", "sent"\)/);
  assert.match(route, /alreadySent: true/);
});

test("completion certificate route still excludes inactive enrolments", () => {
  assert.match(route, /\["declined", "cancelled", "abandoned"\]/);
});
