import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("A2: apprenant vierge supprimable, historique bloqué et assistance tracée", () => {
  const route = read("app/api/client/daily/learners/route.ts");
  assert.match(route, /learnerId/);
  assert.match(route, /daily_session_enrolments/);
  assert.match(route, /daily_documents/);
  assert.match(route, /deletionBlocked:true/);
  assert.match(route, /daily_learner_delete/);
  assert.match(route, /allowAssistanceWrite:true/);
});

test("A2: formation supprimable seulement sans dépendance métier", () => {
  const route = read("app/api/client/daily/formations/route.ts");
  for (const dependency of ["daily_sessions", "daily_documents", "daily_formation_registration_requests", "previous_version_id"]) {
    assert.ok(route.includes(dependency), `dépendance manquante: ${dependency}`);
  }
  assert.match(route, /\.delete\(\)/);
  assert.match(route, /daily_formation_delete/);
  assert.match(route, /allowAssistanceWrite: true/);
});

test("A2: session supprimable seulement sans inscrit, activité ni preuve", () => {
  const route = read("app/api/client/daily/sessions/route.ts");
  for (const dependency of ["daily_session_enrolments", "daily_attendance_slots", "daily_documents", "daily_conventions", "daily_convocations", "daily_portal_access_tokens", "daily_session_followup_entries"]) {
    assert.ok(route.includes(dependency), `dépendance manquante: ${dependency}`);
  }
  assert.match(route, /\.delete\(\)/);
  assert.match(route, /daily_session_delete/);
  assert.match(route, /allowAssistanceWrite: true/);
});

test("A2: confirmations explicites présentes dans les trois interfaces", () => {
  const formations = read("components/daily/DailyFormationsManager.tsx");
  const sessions = read("components/daily/DailySessionsManager.tsx");
  const learners = read("app/client/daily/apprenants/page.tsx");
  assert.match(formations, /window\.confirm/);
  assert.match(formations, />Supprimer<\/button>/);
  assert.match(sessions, /window\.confirm/);
  assert.match(sessions, />Supprimer<\/button>/);
  assert.match(learners, /window\.confirm/);
  assert.match(learners, /Supprimer cet apprenant/);
});
