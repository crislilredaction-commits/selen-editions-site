import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pretrainingPath = new URL("../app/api/client/daily/pretraining-documents/send/route.ts", import.meta.url);
const posttrainingPath = new URL("../app/api/client/daily/posttraining-documents/send/route.ts", import.meta.url);

const [pretraining, posttraining] = await Promise.all([
  readFile(pretrainingPath, "utf8"),
  readFile(posttrainingPath, "utf8"),
]);

test("une inscription abandonnée ne peut plus recevoir de convocation", () => {
  assert.match(
    pretraining,
    /\["declined", "cancelled", "abandoned"\]\.includes\(enrolment\.status\)/,
  );
});

test("une inscription abandonnée ne peut plus recevoir de certificat de réalisation", () => {
  assert.match(
    posttraining,
    /\["declined", "cancelled", "abandoned"\]\.includes\(enrolment\.status\)/,
  );
});
