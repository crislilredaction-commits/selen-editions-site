import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pretrainingPath = new URL("../app/api/client/daily/pretraining-documents/send/route.ts", import.meta.url);
const pretrainingGenerationPath = new URL("../app/api/client/daily/pretraining-documents/route.ts", import.meta.url);
const posttrainingPath = new URL("../app/api/client/daily/posttraining-documents/send/route.ts", import.meta.url);
const signedConventionDispatchPath = new URL("../lib/server/dailySignedConventionPretrainingPack.ts", import.meta.url);

const [pretraining, pretrainingGeneration, posttraining, signedConventionDispatch] = await Promise.all([
  readFile(pretrainingPath, "utf8"),
  readFile(pretrainingGenerationPath, "utf8"),
  readFile(posttrainingPath, "utf8"),
  readFile(signedConventionDispatchPath, "utf8"),
]);

test("une inscription abandonnée ne peut plus recevoir de convocation", () => {
  assert.match(
    pretraining,
    /\["declined", "cancelled", "abandoned"\]\.includes\(enrolment\.status\)/,
  );
});

test("une inscription abandonnée est exclue de la génération des documents préformation", () => {
  assert.match(
    pretrainingGeneration,
    /\.not\("status","in",'\(declined,cancelled,abandoned\)'\)/,
  );
});

test("une inscription abandonnée ne peut plus recevoir de certificat de réalisation", () => {
  assert.match(
    posttraining,
    /\["declined", "cancelled", "abandoned"\]\.includes\(enrolment\.status\)/,
  );
});

test("la signature de convention ne contourne pas le statut de l'inscription", () => {
  assert.match(signedConventionDispatch, /from\("daily_session_enrolments"\)/);
  assert.match(signedConventionDispatch, /\.eq\("id", recipientKey\)/);
  assert.match(signedConventionDispatch, /\.eq\("session_id", convention\.session_id\)/);
  assert.match(signedConventionDispatch, /inactiveEnrolmentStatuses = new Set\(\["declined", "cancelled", "abandoned"\]\)/);
  assert.match(signedConventionDispatch, /return \{ status: "inactive_enrolment" \}/);

  const enrolmentGuard = signedConventionDispatch.indexOf('from("daily_session_enrolments")');
  const emailDispatch = signedConventionDispatch.indexOf("sendDailyConvocation({");
  assert.ok(enrolmentGuard >= 0 && emailDispatch > enrolmentGuard, "le statut inscription doit être contrôlé avant tout envoi email");
});
