import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath=new URL("../app/api/internal/daily/positioning-start-reminder-automation/route.ts",import.meta.url);
const emailPath=new URL("../lib/server/dailyPositioningStartReminderEmails.ts",import.meta.url);
const workspacePath=new URL("../components/daily/DailyStakeholderWorkspace.tsx",import.meta.url);
const[route,email,workspace]=await Promise.all([readFile(routePath,"utf8"),readFile(emailPath,"utf8"),readFile(workspacePath,"utf8")]);

test("le rappel attend le premier jour et l'heure réelle de démarrage",()=>{assert.match(route,/\.eq\("start_date",now\.date\)/);assert.match(route,/firstStart\(session\.schedule_blocks,now\.date\)/);assert.match(route,/now\.minutes>=start/)});
test("seuls les positionnements manquants des inscriptions actives déclenchent le rappel",()=>{assert.match(route,/positioning_status/);assert.match(route,/INACTIVE\.has/);assert.match(route,/DONE\.has/);assert.match(route,/if\(!missing\.length\)continue/)});
test("le rappel cible uniquement les formateurs rattachés à la session",()=>{assert.match(route,/trainer_ids/);assert.match(route,/daily_trainer_profiles/);assert.match(route,/professional_email/)});
test("un formateur ne reçoit qu'un rappel par session",()=>{assert.match(route,/communication_type\",\"positioning_start_reminder/);assert.match(route,/trainer_profile_id/);assert.match(route,/status:\"already_sent\"/)});
test("l'envoi est tracé avant Resend puis finalisé",()=>{assert.match(route,/status:\"queued\"/);assert.match(route,/sendDailyPositioningStartReminder/);assert.match(route,/provider_message_id/);assert.match(route,/status:\"failed\"/)});
test("le mail donne les noms manquants sans exposer leurs réponses",()=>{assert.match(email,/missingLearnerNames/);assert.match(email,/peuvent encore le compléter depuis leur espace apprenant au début de la formation/);assert.doesNotMatch(route,/daily_positioning_responses/);assert.doesNotMatch(email,/answers/)});
test("le questionnaire apprenant reste disponible pendant la formation",()=>{assert.match(workspace,/currentPhase\s*!==\s*"after"/);assert.match(workspace,/\/positionnement/)});
test("l'automatisation conserve un mode dry-run par défaut",()=>{assert.match(route,/execute=url\.searchParams\.get\("execute"\)===\"1\"/);assert.match(route,/if\(!execute\)/)});
