import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [route, page] = await Promise.all([
  readFile(new URL("../app/api/daily-attendance/[token]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/daily-emargement/[token]/page.tsx", import.meta.url), "utf8"),
]);

test("AR1 ouvre le lien individuel post-session uniquement pour un rejet courant", () => {
  assert.match(route, /rejectedCorrection\(accessRecord\)/);
  assert.match(route, /slot\.status === "closed" && !correction/);
  assert.match(route, /allowCompleted\s*\? \["declined", "cancelled", "abandoned"\]/);
  assert.match(route, /review\.state !== "rejected"/);
});

test("AR1 transforme la preuve vN+1 en attente de validation sans la valider à la place de l'organisme", () => {
  assert.match(route, /const version = correction\.version \+ 1/);
  assert.match(route, /submitted_via: "targeted_correction_link"/);
  assert.match(route, /state: "awaiting_validation"/);
  assert.match(route, /status: "pending"/);
  assert.match(route, /rejection_reason: null/);
  assert.doesNotMatch(route, /submitted_via: "targeted_correction_link"[\s\S]{0,900}status: "present"/);
});

test("AR1 protège la concurrence et supprime la preuve isolée si l'état a changé", () => {
  assert.match(route, /correction\.version !== correctionAtOpen\.version/);
  assert.match(route, /\.eq\("updated_at", current\.updated_at\)/);
  assert.match(route, /await admin\.storage\.from\("documents"\)\.remove\(\[storagePath\]\)/);
});

test("AR1 consomme tous les anciens liens actifs après le dépôt réussi", () => {
  assert.match(route, /\.update\(\{ status: "revoked", last_used_at: signedAt \}\)/);
  assert.match(route, /\.eq\("slot_id", access\.slot_id\)/);
  assert.match(route, /\.eq\("enrolment_id", identity\.enrolment\.id\)/);
  assert.match(route, /submittedForReview: true/);
  assert.equal((route.match(/isLateAttendanceRecord\(accessRecord\) && !correction(?:AtOpen)?/g) ?? []).length, 2);
  assert.match(route, /Ce lien de correction n’est plus actif/);
});

test("la page explique le rejet et l'attente de validation sans falsifier la date", () => {
  assert.match(page, /Une nouvelle preuve est demandée/);
  assert.match(page, /Version refusée/);
  assert.match(page, /La date réelle de cette nouvelle transmission sera conservée/);
  assert.match(page, /attend la validation de l.organisme de formation/);
});
