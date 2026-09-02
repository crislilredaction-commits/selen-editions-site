import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("../app/api/client/daily/learners/route.ts", import.meta.url);
const route = await readFile(routePath, "utf8");

test("une inscription vérifie la session et l'apprenant dans l'organisme courant", () => {
  assert.match(route, /belongsToOrganisation\(context\.admin, "daily_sessions", sessionId, context\.organisationId\)/);
  assert.match(route, /belongsToOrganisation\(context\.admin, "daily_learners", learnerId, context\.organisationId\)/);
  assert.match(route, /Session ou apprenant introuvable dans votre organisme\./);
});

test("les besoins spécifiques vérifient l'inscription dans l'organisme courant", () => {
  assert.match(route, /belongsToOrganisation\(context\.admin, "daily_session_enrolments", enrolmentId, context\.organisationId\)/);
  assert.match(route, /Inscription introuvable dans votre organisme\./);
});

test("le garde d'appartenance filtre toujours sur organisation_id", () => {
  assert.match(route, /\.eq\("id", id\)\.eq\("organisation_id", organisationId\)\.maybeSingle\(\)/);
});
