import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("le suivi annuel formateur reste rattaché au profil du formateur connecté", async () => {
  const route = await read("app/api/client/daily/trainer-annual-review/route.ts");

  assert.match(route, /getDailyClientWorkspace\(\)/);
  assert.match(route, /roles\.includes\("trainer"\)/);
  assert.match(route, /\.eq\("organisation_id", organisationId\)/);
  assert.match(route, /\.eq\("user_id", userId\)/);
  assert.match(route, /\.eq\("trainer_profile_id", trainerProfileId\)/);
});

test("la transmission du bilan verrouille les modifications et notifie le responsable", async () => {
  const route = await read("app/api/client/daily/trainer-annual-review/route.ts");

  assert.match(route, /status === "submitted"/);
  assert.match(route, /status: "submitted"/);
  assert.match(route, /submitted_at: submittedAt/);
  assert.match(route, /sendTrainerAnnualReviewManagerEmail/);
  assert.match(route, /manager_notified_at/);
});

test("une formation suivie exige son attestation avant transmission", async () => {
  const route = await read("app/api/client/daily/trainer-annual-review/route.ts");

  assert.match(route, /training_kind === "completed" && !training\.attestation_document_id/);
  assert.match(route, /Ajoutez l’attestation de chaque formation suivie/);
});

test("les relances annuelles sont bornées, espacées et cessent après transmission", async () => {
  const route = await read("app/api/internal/daily/trainer-annual-reminders/route.ts");

  assert.match(route, /MAX_EMAILS_PER_RUN = 20/);
  assert.match(route, /REMINDER_INTERVAL_DAYS = 7/);
  assert.match(route, /review\?\.status === "submitted"/);
  assert.match(route, /next_reminder_at: nextReminder\(now\)/);
  assert.match(route, /\.neq\("status", "submitted"\)/);
});

test("l’interface du formateur et celle du responsable restent présentes", async () => {
  const [trainerPage, managerPage] = await Promise.all([
    read("app/client/daily/formateur/suivi-annuel/page.tsx"),
    read("app/client/daily/formateurs/suivi-annuel/page.tsx"),
  ]);

  assert.match(trainerPage, /trainer-annual-review/);
  assert.match(managerPage, /trainer-annual-reviews/);
});
