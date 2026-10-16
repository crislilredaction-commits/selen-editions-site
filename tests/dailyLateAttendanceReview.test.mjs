import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("../app/api/client/daily/attendance/route.ts", import.meta.url);
const pagePath = new URL("../app/client/daily/presences/page.tsx", import.meta.url);
const portalRoutePath = new URL("../app/api/daily-portal/[token]/attendance/route.ts", import.meta.url);
const reminderPath = new URL("../app/api/client/daily/attendance/reminder/route.ts", import.meta.url);
const automationPath = new URL("../app/api/internal/daily/attendance-automation/route.ts", import.meta.url);
const [route, page, portalRoute, reminder, automation] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(pagePath, "utf8"),
  readFile(portalRoutePath, "utf8"),
  readFile(reminderPath, "utf8"),
  readFile(automationPath, "utf8"),
]);

test("AR1 réserve la décision aux gestionnaires de sessions de l'organisation", () => {
  assert.match(route, /getDailyOrganisationContext\(req, "sessions"\)/);
  assert.match(route, /\.eq\("organisation_id", context\.organisationId\)/);
  assert.match(route, /\.eq\("session_id", sessionId\)/);
  assert.match(route, /action === "review_late_attendance"/);
});

test("AR1 valide ou rejette uniquement une preuve tardive réellement en attente", () => {
  assert.match(route, /metadata\.late_attendance !== true/);
  assert.match(route, /current\.status !== "pending"/);
  assert.match(route, /review\.state !== "awaiting_validation"/);
  assert.match(route, /decision === "reject" && reason\.length < 3/);
  assert.match(route, /Validez ou rejetez d’abord la preuve de régularisation soumise/);
});

test("AR1 conserve décision, identité, motif, version et horodatage réel", () => {
  for (const marker of ["decided_at", "decided_by", "decided_by_email", "rejection_reason", "reviewer_mode", "versions"]) {
    assert.match(route, new RegExp(marker));
  }
  assert.match(route, /validated_at: decidedAt/);
  assert.match(route, /validated_by: reviewerId/);
  assert.match(route, /\.eq\("updated_at", current\.updated_at\)/);
});

test("AR1 rouvre après rejet et clôt uniquement après validation", () => {
  assert.match(route, /state: decision === "validate" \? "validated" : "rejected"/);
  assert.match(route, /status: "present"/);
  assert.match(route, /status: "pending"/);
  assert.match(page, /Rejeter et rouvrir/);
  assert.match(page, /Valider la preuve/);
});

test("le portail n'expose que l'état utile, jamais les chemins ni empreintes de preuve", () => {
  assert.match(portalRoute, /reviewState/);
  assert.match(portalRoute, /rejectionReason/);
  assert.doesNotMatch(portalRoute, /signature_storage_path/);
  assert.doesNotMatch(portalRoute, /signature_sha256/);
  assert.doesNotMatch(portalRoute, /proof_sha256/);
});

test("les relances manuelles et automatiques s'arrêtent pendant la validation", () => {
  for (const source of [reminder, automation]) {
    assert.match(source, /awaitingLateReview/);
    assert.match(source, /late_attendance/);
    assert.match(source, /awaiting_validation/);
    assert.match(source, /evidence_metadata/);
  }
});
