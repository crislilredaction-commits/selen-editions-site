import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cancellation = await readFile(new URL("../app/api/client/daily/enrolments/cancel/route.ts", import.meta.url), "utf8");
const abandonment = await readFile(new URL("../app/api/client/daily/enrolments/abandon/route.ts", import.meta.url), "utf8");
const learnerApi = await readFile(new URL("../app/api/client/daily/learners/route.ts", import.meta.url), "utf8");
const learnerPage = await readFile(new URL("../app/client/daily/apprenants/page.tsx", import.meta.url), "utf8");
const sessionsApi = await readFile(new URL("../app/api/client/daily/sessions/route.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261011010725_daily_atomic_enrolment_cancellation.sql", import.meta.url), "utf8");

test("une désinscription passe par une seule fonction transactionnelle bornée à l'organisme", () => {
  assert.match(cancellation, /rpc\("daily_cancel_enrolment"/);
  assert.match(cancellation, /p_organisation_id: context\.organisationId/);
  assert.match(cancellation, /p_enrolment_id: enrolmentId/);
  assert.doesNotMatch(cancellation, /\.from\(/);
  assert.doesNotMatch(cancellation, /\.delete\(\)/);
});

test("motif et date obligatoires, historique et révocations sont atomiques en base", () => {
  assert.match(cancellation, /!enrolmentId \|\| !reason \|\| !occurredAt/);
  assert.match(migration, /for update of enrolment/);
  assert.match(migration, /update public\.daily_session_enrolments[\s\S]*status = 'cancelled'/);
  assert.match(migration, /insert into public\.daily_session_followup_entries/);
  assert.match(migration, /update public\.daily_portal_access_tokens/);
  assert.match(migration, /entity_key = 'learner:' \|\| v_enrolment\.learner_id::text/);
  assert.match(migration, /update public\.daily_attendance_access_tokens/);
  assert.match(migration, /enrolment_id = v_enrolment\.id/);
  assert.doesNotMatch(migration, /delete from/);
});

test("abandon et annulation sont des procédures distinctes", () => {
  assert.match(learnerPage, /Déclarer un abandon en cours de formation/);
  assert.match(learnerPage, /Désinscrire avant formation/);
  assert.match(learnerPage, /\/api\/client\/daily\/enrolments\/abandon/);
  assert.match(abandonment, /confirmDailyEnrolmentAbandonment/);
  assert.match(learnerApi, /Utilisez la procédure de désinscription ou d’abandon/);
});

test("les effectifs des sessions excluent annulations et abandons", () => {
  assert.match(sessionsApi, /\(declined,cancelled,abandoned\)/);
});

test("la fonction de désinscription est idempotente et ferme les tâches via les triggers canoniques", () => {
  assert.match(migration, /if v_enrolment\.status = 'cancelled'[\s\S]*v_already_cancelled := true/);
  assert.match(migration, /alreadyCancelled/);
  assert.match(migration, /update public\.daily_session_enrolments/);
  assert.match(migration, /for update of enrolment/);
});

test("la fonction est invoker et strictement réservée au service role", () => {
  assert.match(migration, /security invoker/);
  assert.match(migration, /revoke all on function public\.daily_cancel_enrolment[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.daily_cancel_enrolment[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /security definer/);
});

test("les erreurs SQL sont traduites sans exposer les détails internes", () => {
  assert.match(cancellation, /daily_cancel_enrolment_not_found/);
  assert.match(cancellation, /daily_cancel_session_started/);
  assert.match(cancellation, /daily_cancel_enrolment_already_closed/);
  assert.match(cancellation, /Aucun changement partiel n’a été conservé/);
});
