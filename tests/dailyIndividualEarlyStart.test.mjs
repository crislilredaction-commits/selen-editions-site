import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BENEFICIARY_EARLY_START_TRACE_KEY,
  buildIndividualEarlyStartTrace,
  calculateDistanceWithdrawalDeadline,
  getIndividualEarlyStartRequirement,
  validatePersistedIndividualEarlyStartTrace,
  validateIndividualEarlyStartSubmission,
} from "../lib/dailyIndividualEarlyStart.ts";

const referenceAt = "2026-09-18T12:00:00.000Z";

function requirement(overrides = {}) {
  return getIndividualEarlyStartRequirement({
    responseType: "beneficiary",
    beneficiarySiret: null,
    funding: "personnel",
    sessionStartDate: "2026-09-25",
    referenceAt,
    ...overrides,
  });
}

test("un particulier sans SIRET hors période protégée suit le parcours normal", () => {
  const result = requirement({ sessionStartDate: "2026-10-03" });
  assert.equal(result.required, false);
  assert.equal(result.reason, "outside_distance_withdrawal_period");
});

test("un particulier sans SIRET autofinancé dans la période requiert une demande expresse", () => {
  const result = requirement();
  assert.equal(result.required, true);
  assert.equal(result.reason, "required");
  assert.equal(result.distanceWithdrawalDeadline, "2026-10-02");
});

test("l'absence de demande ou de reconnaissance requise est refusée", () => {
  const applicable = requirement();
  const missingRequest = validateIndividualEarlyStartSubmission(applicable, {
    earlyStartRequested: false,
    fullPerformanceWithdrawalLossAcknowledged: true,
  });
  const missingAcknowledgement = validateIndividualEarlyStartSubmission(applicable, {
    earlyStartRequested: true,
    fullPerformanceWithdrawalLossAcknowledged: false,
  });
  assert.deepEqual(missingRequest.valid, false);
  assert.equal(missingRequest.code, "early_start_request_required");
  assert.deepEqual(missingAcknowledgement.valid, false);
  assert.equal(missingAcknowledgement.code, "full_performance_acknowledgement_required");
});

test("la double confirmation explicite autorisée est valide", () => {
  const result = validateIndividualEarlyStartSubmission(requirement(), {
    earlyStartRequested: true,
    fullPerformanceWithdrawalLossAcknowledged: true,
  });
  assert.deepEqual(result, { valid: true });
});

test("les limites du délai incluent le dernier jour et excluent le suivant", () => {
  assert.equal(calculateDistanceWithdrawalDeadline(referenceAt), "2026-10-02");
  assert.equal(requirement({ sessionStartDate: "2026-10-02" }).required, true);
  assert.equal(requirement({ sessionStartDate: "2026-10-03" }).required, false);
});

test("une échéance un samedi ou un jour férié est reportée au premier jour ouvrable", () => {
  assert.equal(calculateDistanceWithdrawalDeadline("2026-09-05T12:00:00.000Z"), "2026-09-21");
  assert.equal(calculateDistanceWithdrawalDeadline("2026-12-11T12:00:00.000Z"), "2026-12-28");
});

test("le bénéficiaire avec SIRET et l'entreprise commanditaire restent hors de ce mécanisme", () => {
  assert.equal(requirement({ beneficiarySiret: "12345678901234" }).reason, "beneficiary_with_siret");
  assert.equal(requirement({ responseType: "company" }).reason, "company");
  assert.equal(requirement({ funding: "entreprise" }).reason, "not_personally_funded");
});

test("la trace canonique porte la demande, l'horodatage, la session et le contexte juridique", () => {
  const applicable = requirement({ sessionStartDate: "2026-10-02" });
  const trace = buildIndividualEarlyStartTrace({
    requirement: applicable,
    recordedAt: referenceAt,
    sessionId: "session-123",
    sessionStartDate: "2026-10-02",
    sessionEndDate: "2026-10-03",
  });
  assert.equal(BENEFICIARY_EARLY_START_TRACE_KEY, "beneficiary_early_start_request");
  assert.equal(trace.requested, true);
  assert.equal(trace.full_performance_withdrawal_loss_acknowledged, true);
  assert.equal(trace.text_version, "2026-09-18-v1");
  assert.match(trace.request_text, /2 octobre 2026/);
  assert.match(trace.full_performance_acknowledgement_text, /ne supprime pas immédiatement mon droit de rétractation/);
  assert.equal(trace.recorded_at, referenceAt);
  assert.equal(trace.session_id, "session-123");
  assert.equal(trace.distance_withdrawal_days, 14);
  assert.equal(trace.individual_training_withdrawal_days, 10);
  assert.equal("renounced" in trace, false);
  assert.equal(validatePersistedIndividualEarlyStartTrace({
    requirement: applicable,
    trace,
    sessionId: "session-123",
    sessionStartDate: "2026-10-02",
    expectedRecordedAt: referenceAt,
  }).valid, true);
  assert.equal(validatePersistedIndividualEarlyStartTrace({
    requirement: applicable,
    trace,
    sessionId: "another-session",
    sessionStartDate: "2026-10-02",
    expectedRecordedAt: referenceAt,
  }).valid, false);
});

test("l'API recalcule depuis la session canonique, rejette le contournement et signe la trace persistée", async () => {
  const route = await readFile(new URL("../app/api/daily-registration/[token]/route.ts", import.meta.url), "utf8");
  const traceAssignment = route.indexOf("needAnswers[BENEFICIARY_EARLY_START_TRACE_KEY] = buildIndividualEarlyStartTrace");
  const signature = route.indexOf("const signature = buildApplicationSignature");
  const persistence = route.indexOf("need_answers: needAnswers");
  assert.match(route, /sessionStartDate: attachedSession\?\.start_date \?\? null/);
  assert.match(route, /earlyStartRequested: body\.early_start_requested/);
  assert.match(route, /if \(!earlyStartValidation\.valid\) return NextResponse\.json\(\{ error: earlyStartValidation\.error \}, \{ status: 400 \}\)/);
  assert.match(route, /delete needAnswers\[BENEFICIARY_EARLY_START_TRACE_KEY\]/);
  assert.ok(traceAssignment > -1 && signature > traceAssignment && persistence > signature);
});

test("la décision refuse aussi une affectation tardive sans trace signée pour la session", async () => {
  const route = await readFile(new URL("../app/api/client/daily/registration-requests/route.ts", import.meta.url), "utf8");
  assert.match(route, /validateEarlyStartBeforeMaterialization/);
  assert.match(route, /validatePersistedIndividualEarlyStartTrace/);
  assert.match(route, /needAnswers\[BENEFICIARY_EARLY_START_TRACE_KEY\]/);
  assert.match(route, /if \(!earlyStartValidation\.valid\) return NextResponse\.json\(\{ error: earlyStartValidation\.error \}/);
  assert.match(route, /materialization_error: earlyStartValidation\.error/);
});

test("l'interface reste conditionnelle, non précochée et sans renonciation générique", async () => {
  const page = await readFile(new URL("../app/daily-inscription/[token]/page.tsx", import.meta.url), "utf8");
  const fields = await readFile(new URL("../components/daily/IndividualEarlyStartFields.tsx", import.meta.url), "utf8");
  const helper = await readFile(new URL("../lib/dailyIndividualEarlyStart.ts", import.meta.url), "utf8");
  assert.match(page, /earlyStartRequirement\.required && selectedSessionForEarlyStart\?\.start_date/);
  assert.match(page, /setAutomaticSession\(data\.automaticSession\?\.id \? data\.automaticSession : null\)/);
  assert.match(page, /requested=\{form\.early_start_requested === "yes"\}/);
  assert.match(page, /fullPerformanceWithdrawalLossAcknowledged=\{form\.full_performance_withdrawal_loss_acknowledged === "yes"\}/);
  assert.match(fields, /Cette demande ne supprime pas votre droit de rétractation/);
  assert.match(fields, /INDIVIDUAL_FULL_PERFORMANCE_ACKNOWLEDGEMENT_TEXT/);
  assert.match(helper, /entièrement exécutée avant la fin du délai de quatorze jours/);
  assert.doesNotMatch(`${fields}\n${helper}`, /Je renonce/i);
});
