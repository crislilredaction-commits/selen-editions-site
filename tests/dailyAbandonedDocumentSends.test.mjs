import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pretrainingPath = new URL("../app/api/client/daily/pretraining-documents/send/route.ts", import.meta.url);
const pretrainingGenerationPath = new URL("../app/api/client/daily/pretraining-documents/route.ts", import.meta.url);
const posttrainingGenerationPath = new URL("../app/api/client/daily/posttraining-documents/route.ts", import.meta.url);
const posttrainingHelperPath = new URL("../lib/server/dailyPosttrainingDocuments.ts", import.meta.url);
const posttrainingPath = new URL("../app/api/client/daily/posttraining-documents/send/route.ts", import.meta.url);
const signedConventionDispatchPath = new URL("../lib/server/dailySignedConventionPretrainingPack.ts", import.meta.url);
const attendancePath = new URL("../app/api/client/daily/attendance/route.ts", import.meta.url);
const attendanceAutomationPath = new URL("../app/api/internal/daily/attendance-automation/route.ts", import.meta.url);
const endEvaluationsPath = new URL("../app/api/client/daily/end-evaluations/route.ts", import.meta.url);

const [
  pretraining,
  pretrainingGeneration,
  posttrainingGeneration,
  posttrainingHelper,
  posttraining,
  signedConventionDispatch,
  attendance,
  attendanceAutomation,
  endEvaluations,
] = await Promise.all([
  readFile(pretrainingPath, "utf8"),
  readFile(pretrainingGenerationPath, "utf8"),
  readFile(posttrainingGenerationPath, "utf8"),
  readFile(posttrainingHelperPath, "utf8"),
  readFile(posttrainingPath, "utf8"),
  readFile(signedConventionDispatchPath, "utf8"),
  readFile(attendancePath, "utf8"),
  readFile(attendanceAutomationPath, "utf8"),
  readFile(endEvaluationsPath, "utf8"),
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

test("une inscription abandonnée est exclue de la génération des documents de fin", () => {
  assert.match(
    posttrainingHelper,
    /\.not\("status", "in", '\(declined,cancelled,abandoned\)'\)/,
  );
});

test("la route manuelle réutilise le même générateur de documents de fin", () => {
  assert.match(posttrainingGeneration, /generatePosttrainingDocuments/);
  assert.match(posttrainingGeneration, /mode: "manual"/);
});

test("la génération automatique attend une vraie fin de session", () => {
  assert.match(posttrainingHelper, /mode === "auto"/);
  assert.match(posttrainingHelper, /session\.end_date/);
  assert.match(posttrainingHelper, /slot\.status !== "closed"/);
  assert.match(posttrainingHelper, /record\.status !== "pending"/);
  assert.match(posttrainingHelper, /assessment\.outcome !== "pending"/);
});

test("la génération automatique est idempotente et ne recrée pas les versions existantes", () => {
  assert.match(posttrainingHelper, /existingKeys\.has\(attendanceKey\)/);
  assert.match(posttrainingHelper, /existingKeys\.has\(certificateKey\)/);
  assert.match(posttrainingHelper, /return autoBlocked\("already_generated", eligibleCertificates\)/);
});

test("la clôture d'émargement et la régularisation d'absence retentent les documents de fin", () => {
  assert.match(attendance, /action === "close_slot"[\s\S]*tryEnsurePosttrainingDocuments/);
  assert.match(attendance, /action === "set_absence"[\s\S]*tryEnsurePosttrainingDocuments/);
});

test("la dernière évaluation finale peut déclencher les documents de fin", () => {
  assert.match(endEvaluations, /action === "save_assessment"[\s\S]*tryEnsurePosttrainingDocuments/);
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

test("une inscription abandonnée est exclue de l'émargement et des liens individuels", () => {
  assert.match(
    attendance,
    /status !== "declined" && status !== "cancelled" && status !== "abandoned"/,
  );
  assert.match(attendance, /filter\(\(enrolment\) => activeEnrolment\(enrolment\.status\)\)/);
  assert.match(attendance, /if \(!enrolment \|\| !activeEnrolment\(enrolment\.status\)\)/);
});

test("l'automatisation d'émargement exclut aussi les inscriptions abandonnées", () => {
  assert.match(
    attendanceAutomation,
    /\["declined", "cancelled", "abandoned", "completed"\]\.includes\(status \?\? ""\)/,
  );
});

test("un échec de finalisation de la preuve email rend l'automatisation non OK sans provoquer de réenvoi", () => {
  assert.match(attendanceAutomation, /if \(finalizeError\) failed \+= 1;/);
  assert.match(attendanceAutomation, /status: finalizeError \? "sent_evidence_finalize_failed" : "sent"/);
  assert.match(attendanceAutomation, /\.in\("status", \["queued", "sent"\]\)/);
});
