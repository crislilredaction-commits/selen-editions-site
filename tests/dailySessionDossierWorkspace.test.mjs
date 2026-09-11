import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pagePath = new URL("../app/client/daily/dossiers/page.tsx", import.meta.url);
const routePath = new URL("../app/api/client/daily/session-dossiers/route.ts", import.meta.url);
const sessionsManagerPath = new URL("../components/daily/DailySessionsManager.tsx", import.meta.url);

const [page, route, sessionsManager] = await Promise.all([
  readFile(pagePath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(sessionsManagerPath, "utf8"),
]);

test("le dossier de session expose une timeline cliquable avant pendant après", () => {
  assert.match(page, /aria-label="Timeline de la session"/);
  assert.match(page, /scrollToPhase\(phase\)/);
  assert.match(page, /id={`phase-\$\{phase\}`}/);
  assert.match(page, /Avant la formation/);
  assert.match(page, /Pendant la formation/);
  assert.match(page, /Après la formation/);
});

test("le dossier réutilise le programme canonique de la formation", () => {
  assert.match(route, /detailed_program/);
  assert.match(route, /detailed_program_document_url/);
  assert.match(route, /registration_methods/);
  assert.match(route, /access_delays/);
  assert.match(page, /Programme applicable à cette session/);
  assert.match(page, /Ouvrir le document programme/);
  assert.match(page, /Modalités d’inscription/);
  assert.match(page, /Délais d’accès/);
});

test("le dossier consolide communications documents et signatures depuis les sources canoniques", () => {
  assert.match(route, /from\("daily_communications"\)/);
  assert.match(route, /from\("daily_communication_documents"\)/);
  assert.match(route, /from\("daily_documents"\)/);
  assert.match(route, /from\("daily_convention_signatures"\)/);
  assert.match(page, /Communications & preuves/);
  assert.match(page, /Journal de la session/);
  assert.match(page, /Signatures convention \/ contrat/);
});

test("les signatures de convention sans organisation_id sont bornées aux sessions déjà autorisées", () => {
  assert.match(route, /const sessionIds = \(sessions \?\? \[\]\)\.map/);
  assert.match(route, /daily_convention_signatures[\s\S]*\.in\("session_id", sessionIds\)/);
});

test("les ordres de mission sont bornés à l'organisation et aux sessions autorisées", () => {
  assert.match(route, /from\("daily_mission_orders"\)/);
  assert.match(route, /daily_mission_orders[\s\S]*\.eq\("organisation_id", context\.organisationId\)[\s\S]*\.overlaps\("session_ids", sessionIds\)/);
});

test("les signatures d'ordre de mission sont relues uniquement depuis les ordres autorisés", () => {
  assert.match(route, /const missionOrderIds = \(missionOrders \?\? \[\]\)\.map/);
  assert.match(route, /from\("daily_mission_order_signatures"\)[\s\S]*\.in\("mission_order_id", missionOrderIds\)/);
  assert.match(route, /missionOrders: missionOrders \?\? \[\]/);
  assert.match(route, /missionOrderSignatures: missionOrderSignatures \?\? \[\]/);
});

test("le dossier affiche les ordres de mission formateur séparément des contrats conventions", () => {
  assert.match(page, /type MissionOrder =/);
  assert.match(page, /setMissionOrders\(body\.missionOrders\|\|\[\]\)/);
  assert.match(page, /setMissionOrderSignatures\(body\.missionOrderSignatures\|\|\[\]\)/);
  assert.match(page, /Ordres de mission formateur/);
  assert.match(page, /Signature professionnelle · distincte du contrat \/ convention/);
  assert.match(page, /missionOrderStatusLabel/);
});

test("les signaux email ne sont jamais présentés comme preuve de signature", () => {
  assert.match(page, /Cliqué · signal technique/);
  assert.match(page, /Ouvert · signal technique/);
  assert.match(page, /jamais une preuve de signature/);
  assert.match(page, /signature\.signed_at/);
});

test("D3 consolide les états canoniques accès positionnement émargement évaluations et satisfactions", () => {
  assert.match(route, /from\("daily_session_enrolments"\)[\s\S]*positioning_status/);
  assert.match(route, /from\("daily_portal_access_tokens"\)[\s\S]*\.in\("session_id", sessionIds\)/);
  assert.match(route, /from\("daily_attendance_slots"\)/);
  assert.match(route, /from\("daily_attendance_records"\)/);
  assert.match(route, /from\("daily_learning_assessments"\)/);
  assert.match(route, /from\("daily_learner_feedback_responses"\)/);
  assert.match(route, /from\("daily_stakeholder_satisfaction_responses"\)/);
  assert.match(route, /canonicalStates:/);
});

test("les états D3 restent bornés à l'organisation ou aux sessions déjà autorisées", () => {
  assert.match(route, /daily_session_enrolments[\s\S]*\.eq\("organisation_id", context\.organisationId\)[\s\S]*\.in\("session_id", sessionIds\)/);
  assert.match(route, /daily_portal_access_tokens[\s\S]*\.in\("session_id", sessionIds\)/);
  assert.match(route, /daily_attendance_slots[\s\S]*\.eq\("organisation_id", context\.organisationId\)[\s\S]*\.in\("session_id", sessionIds\)/);
  assert.match(route, /daily_attendance_records[\s\S]*\.eq\("organisation_id", context\.organisationId\)[\s\S]*\.in\("session_id", sessionIds\)/);
  assert.match(route, /daily_learning_assessments[\s\S]*\.eq\("organisation_id", context\.organisationId\)[\s\S]*\.in\("session_id", sessionIds\)/);
});

test("D4 sort les sessions réellement terminées du planning actif sans clôturer artificiellement leur dossier", () => {
  assert.match(sessionsManager, /function sessionEndTimestamp\(session: Session\)/);
  assert.match(sessionsManager, /schedule_blocks[\s\S]*Math\.max\(\.\.\.scheduledEnds\)/);
  assert.match(sessionsManager, /const plannedSessions = useMemo\([\s\S]*dossierStatus !== "completed"[\s\S]*!isSessionEnded\(session, planningNow\)/);
  assert.match(sessionsManager, /const endedSessions = useMemo\([\s\S]*dossierStatus !== "completed"[\s\S]*isSessionEnded\(session, planningNow\)/);
  assert.match(sessionsManager, /title="Sessions terminées"/);
  assert.match(sessionsManager, /dossier encore à finaliser/);
});

test("D4 calcule la fin de session dans le fuseau canonique Europe Paris", () => {
  assert.match(sessionsManager, /const PARIS_TIME_ZONE = "Europe\/Paris"/);
  assert.match(sessionsManager, /timeZone: PARIS_TIME_ZONE/);
  assert.match(sessionsManager, /\.map\(\(block\) => parisTimestamp\(block\.date, block\.end\)\)/);
  assert.match(sessionsManager, /parisTimestamp\(session\.end_date, "23:59:59"\)/);
  assert.doesNotMatch(sessionsManager, /new Date\(`\$\{block\.date\}T\$\{block\.end\}:00`\)/);
});

test("D4 rafraîchit l'horloge du planning tant que la page reste ouverte", () => {
  assert.match(sessionsManager, /const \[planningNow, setPlanningNow\] = useState\(\(\) => Date\.now\(\)\)/);
  assert.match(sessionsManager, /const refreshPlanningClock = \(\) => setPlanningNow\(Date\.now\(\)\)/);
  assert.match(sessionsManager, /window\.setInterval\(refreshPlanningClock, 60_000\)/);
  assert.match(sessionsManager, /window\.clearInterval\(intervalId\)/);
});

test("D4 conserve l'accès aux preuves et actions sur les sessions terminées", () => {
  assert.match(sessionsManager, /sessions={endedSessions}[\s\S]*openEvidence={openEvidence}/);
  assert.match(sessionsManager, />Modifier<\/button>/);
  assert.match(sessionsManager, />Preuves apprenants<\/button>/);
  assert.match(sessionsManager, />Dupliquer<\/button>/);
  assert.match(sessionsManager, />Archiver<\/button>/);
});

test("le lot reste une agrégation en lecture sans nouvelle source métier", () => {
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /daily_session_program/);
  assert.doesNotMatch(route, /daily_session_signature_timeline/);
  assert.doesNotMatch(route, /daily_mission_order_signature_timeline/);
  assert.doesNotMatch(route, /daily_session_canonical_states/);
});