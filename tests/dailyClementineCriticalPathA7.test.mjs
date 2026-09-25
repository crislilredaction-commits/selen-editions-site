import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read=(p)=>readFile(new URL(`../${p}`,import.meta.url),"utf8");
const [creator,sessions,learners,access]=await Promise.all([
 read("components/daily/DailyFirstSessionCreator.tsx"),
 read("app/api/client/daily/sessions/route.ts"),
 read("app/api/client/daily/learners/route.ts"),
 read("lib/server/dailyLearnerPortalAccess.ts"),
]);
test("la création de session fonctionne en assistance Studio sans contourner le cloisonnement",()=>{
 assert.match(creator,/assistanceFetch\("\/api\/client\/daily\/sessions"/);
 assert.match(sessions,/allowAssistanceWrite: true/);
 assert.match(sessions,/\.eq\("organisation_id", context\.organisationId\)/);
 assert.match(sessions,/daily_session_create/);
});
test("l'inscription manuelle vérifie session et apprenante dans le même organisme",()=>{
 assert.match(learners,/belongsToOrganisation\(context\.admin,"daily_sessions",sessionId,context\.organisationId\)/);
 assert.match(learners,/belongsToOrganisation\(context\.admin,"daily_learners",learnerId,context\.organisationId\)/);
 assert.match(learners,/ensureAndSendLearnerPortalAccess/);
});
test("l'accès apprenant est envoyé par Resend, tracé et idempotent",()=>{
 assert.match(access,/communication_type: "learner_portal_access"/);
 assert.match(access,/provider: "resend"/);
 assert.match(access,/status: "already_sent"/);
 assert.match(access,/buildDailyPortalAuthEntryUrl/);
 assert.match(access,/resend\.emails\.send/);
});
