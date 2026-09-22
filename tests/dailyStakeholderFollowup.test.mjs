import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const api=fs.readFileSync("app/api/client/daily/quality-overview/route.ts","utf8");
const page=fs.readFileSync("app/client/daily/qualite/pilotage/page.tsx","utf8");
const automation=fs.readFileSync("app/api/internal/daily/stakeholder-satisfaction-automation/route.ts","utf8");

test("A5 expose identité rôle réponse et date",()=>{for(const v of ["stakeholderFollowup","entity_name","entity_email","stakeholder_type","responded","responded_at"])assert.ok(api.includes(v),v)});
test("A5 trace demande initiale et deux relances email",()=>{assert.match(automation,/REMINDER_OFFSETS_DAYS = \[2, 4\] as const/);assert.match(api,/automation_stage/);assert.match(page,/Relance 1 \(J\+2\)/);assert.match(page,/Relance 2 \(J\+4\)/);assert.match(page,/reminder_count/)});
test("A5 stoppe les relances après réponse",()=>{assert.match(automation,/responseKeys\.has\(responseKey\)/);assert.match(automation,/already_submitted/)});
test("A5 ne demande jamais au client une relance téléphonique",()=>{assert.doesNotMatch(automation,/Relance téléphonique satisfaction|Contacter la partie prenante par téléphone/);assert.match(page,/aucune relance téléphonique ne vous est demandée/);assert.match(page,/suivi éventuel relève de Selen/)});
test("A5 borne le suivi à l organisation",()=>{assert.match(api,/daily_sessions/);assert.match(api,/eq\("organisation_id",context\.organisationId\)/);assert.match(api,/in\("session_id",portalSessionIds\)/)});
