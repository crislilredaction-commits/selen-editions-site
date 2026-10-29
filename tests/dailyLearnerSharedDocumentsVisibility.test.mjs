import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const resourcesPath = new URL("../app/api/daily-portal/[token]/resources/route.ts", import.meta.url);
const portalPath = new URL("../app/api/daily-portal/[token]/route.ts", import.meta.url);
const documentPath = new URL("../app/api/daily-portal/[token]/document/route.ts", import.meta.url);
const assessmentPath = new URL("../app/api/daily-portal/[token]/assessment/route.ts", import.meta.url);
const satisfactionPath = new URL("../app/api/daily-portal/[token]/satisfaction/route.ts", import.meta.url);
const conventionPath = new URL("../app/api/daily-portal/[token]/convention/route.ts", import.meta.url);
const convocationPath = new URL("../app/api/daily-portal/[token]/convocation/route.ts", import.meta.url);
const publisherPath = new URL("../app/api/client/daily/learner-shared-documents/route.ts", import.meta.url);
const visibilityPath = new URL("../lib/server/dailyPortalResourceVisibility.ts", import.meta.url);

const [resources, portal, document, assessment, satisfaction, convention, convocation, publisher, visibility] = await Promise.all([
  readFile(resourcesPath, "utf8"),
  readFile(portalPath, "utf8"),
  readFile(documentPath, "utf8"),
  readFile(assessmentPath, "utf8"),
  readFile(satisfactionPath, "utf8"),
  readFile(conventionPath, "utf8"),
  readFile(convocationPath, "utf8"),
  readFile(publisherPath, "utf8"),
  readFile(visibilityPath, "utf8"),
]);
const resourceRules = `${resources}\n${visibility}`;

test("le portail ressources reconnaît les trois portées publiables", () => {
  for (const scope of ["organisation", "session", "learners"]) {
    assert.match(resourceRules, new RegExp(`scope === \\"${scope}\\"`));
  }
});

test("un document organisme est visible par un apprenant", () => {
  assert.match(resourceRules, /scope === "organisation"\) return role === "learner" \|\| role === "trainer"/);
  assert.match(portal, /isDailyPortalResourceVisible/);
});

test("une diffusion ciblée vérifie le learner_id de l'apprenant courant", () => {
  assert.match(resources, /select\("id,learner_id,status,daily_learners\(email\)"\)/);
  assert.match(resources, /allowedLearnerIds = matchingRows\.map/);
  assert.match(resourceRules, /scope === "learners" && role === "learner"/);
  assert.match(resourceRules, /metadata\.learner_ids\.map\(String\)\.some/);
  assert.match(portal, /learnerIds:\[String\(enrolment\.learner_id\?\?""\)\]/);
});

test("les inscriptions apprenant refusées, annulées ou abandonnées ne donnent pas accès", () => {
  assert.match(resources, /!\["declined", "cancelled", "abandoned"\]\.includes\(text\(row\.status\)\)/);
  assert.match(portal, /activeEnrolments=\(enrolmentsR\.data\?\?\[\]\)\.filter\(row=>!\["declined","cancelled","abandoned"\]\.includes\(String\(row\.status\?\?""\)\)\)/);
  assert.match(document, /\.select\("id,learner_id,status,daily_learners/);
  assert.match(document, /\["declined","cancelled","abandoned"\]\.includes\(String\(enrolment\.status\?\?""\)\)/);
  assert.doesNotMatch(document, /\.not\("status","in","\(declined,cancelled,abandoned\)"\)/);
  assert.match(assessment, /\["declined", "cancelled", "abandoned"\]\.includes\(String\(enrolment\.status \?\? ""\)\)/);
  assert.doesNotMatch(assessment, /\.not\("status", "in", "\(declined,cancelled,abandoned\)"\)/);
});

test("un token de portail révoqué ou expiré est refusé avant de charger les données", () => {
  assert.match(resources, /!\["pending", "viewed"\]\.includes\(String\(access\.status \?\? ""\)\)/);
  assert.match(portal, /\["pending","viewed"\]\.includes\(String\(access\.status\?\?""\)\)/);
  assert.match(document, /!\["pending","viewed"\]\.includes\(String\(access\.status\?\?""\)\)/);
  assert.match(assessment, /!\["pending", "viewed"\]\.includes\(String\(access\.status \?\? ""\)\)/);
  assert.match(satisfaction, /\["revoked", "expired"\]\.includes\(String\(access\.status \?\? ""\)\)/);
  assert.match(convention, /!\["pending", "viewed"\]\.includes\(String\(access\.status \?\? ""\)\)/);
  assert.match(convocation, /!\["pending", "viewed"\]\.includes\(String\(access\.status \?\? ""\)\)/);
});

test("les ressources entreprise excluent aussi les inscriptions abandonnées", () => {
  assert.match(resources, /participantEmails\.size[\s\S]*\.not\("status", "in", "\(declined,cancelled,abandoned\)"\)/);
});

test("le back-office conserve les portées organisme, session et apprenants", () => {
  assert.match(publisher, /distribution_scope/);
  assert.match(publisher, /learner_ids/);
  assert.match(publisher, /organisation_shared/);
});

test("le back-office ne propose ni n'accepte un apprenant ayant abandonné", () => {
  const abandonedFilters = publisher.match(/\.not\("status","in","\(cancelled,declined,abandoned\)"\)/g) ?? [];
  assert.equal(abandonedFilters.length, 2);
});
