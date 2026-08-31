import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const resourcesPath = new URL("../app/api/daily-portal/[token]/resources/route.ts", import.meta.url);
const portalPath = new URL("../app/api/daily-portal/[token]/route.ts", import.meta.url);
const publisherPath = new URL("../app/api/client/daily/learner-shared-documents/route.ts", import.meta.url);

const [resources, portal, publisher] = await Promise.all([
  readFile(resourcesPath, "utf8"),
  readFile(portalPath, "utf8"),
  readFile(publisherPath, "utf8"),
]);

test("le portail ressources reconnaît les trois portées publiables", () => {
  for (const scope of ["organisation", "session", "learners"]) {
    assert.match(resources, new RegExp(`scope === \\"${scope}\\"`));
  }
});

test("un document organisme est visible par un apprenant", () => {
  assert.match(resources, /scope === "organisation"\) return access\.portal_type === "learner" \|\| access\.portal_type === "trainer"/);
  assert.match(portal, /if\(scope==="organisation"\)return true/);
});

test("une diffusion ciblée vérifie le learner_id de l'apprenant courant", () => {
  assert.match(resources, /select\("id,learner_id,daily_learners\(email\)"\)/);
  assert.match(resources, /allowedLearnerIds = matchingRows\.map/);
  assert.match(resources, /scope === "learners"\) return access\.portal_type === "learner"/);
  assert.match(resources, /metadata\.learner_ids\.map\(String\)\.some/);
  assert.match(portal, /m\.learner_ids as unknown\[\]\)\.map\(String\)\.includes\(String\(learnerId\)\)/);
});

test("les inscriptions apprenant annulées ou refusées ne donnent pas accès", () => {
  assert.match(resources, /\.not\("status", "in", "\(declined,cancelled\)"\)/);
  assert.match(portal, /\.not\("status","in","\(declined,cancelled\)"\)/);
});

test("le back-office conserve les portées organisme, session et apprenants", () => {
  assert.match(publisher, /distribution_scope/);
  assert.match(publisher, /learner_ids/);
  assert.match(publisher, /organisation_shared/);
});
