import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath=new URL("../supabase/migrations/20260910193000_daily_positioning_responses.sql",import.meta.url);
const apiPath=new URL("../app/api/daily-portal/[token]/positioning/route.ts",import.meta.url);
const pagePath=new URL("../app/daily/portail/[role]/[token]/positionnement/page.tsx",import.meta.url);
const workspacePath=new URL("../components/daily/DailyStakeholderWorkspace.tsx",import.meta.url);
const[migration,api,page,workspace]=await Promise.all([readFile(migrationPath,"utf8"),readFile(apiPath,"utf8"),readFile(pagePath,"utf8"),readFile(workspacePath,"utf8")]);

test("le positionnement dispose d'une source de vérité par inscription",()=>{assert.match(migration,/create table if not exists public\.daily_positioning_responses/);assert.match(migration,/unique \(enrolment_id\)/);assert.match(migration,/question_snapshot jsonb/);assert.match(migration,/answers jsonb/)});
test("la table de réponses n'est pas accessible directement aux comptes clients",()=>{assert.match(migration,/enable row level security/);assert.match(migration,/revoke all on public\.daily_positioning_responses from anon, authenticated/)});
test("une réponse marque automatiquement le positionnement comme terminé",()=>{assert.match(migration,/positioning_status = 'completed'/);assert.match(migration,/trg_sync_daily_positioning_status/)});
test("le portail refuse les inscriptions abandonnées, annulées ou refusées",()=>{assert.match(api,/\.not\("status","in","\(declined,cancelled,abandoned\)"\)/);assert.match(api,/\["revoked","expired"\]/)});
test("le questionnaire réutilise la configuration de la formation",()=>{assert.match(api,/positioning_mode,positioning_questions/);assert.match(api,/question_snapshot:items/);assert.match(api,/positioning_mode\)!=="selen"/)});
test("le formulaire apprenant transmet les réponses au endpoint canonique",()=>{assert.match(page,/\/api\/daily-portal\/\$\{token\}\/positioning/);assert.match(page,/Transmettre mon positionnement/);assert.match(page,/JSON\.stringify\(\{answers\}\)/)});
test("l'espace apprenant ouvre directement le positionnement tant qu'il n'est pas terminé",()=>{assert.match(workspace,/positioning_status/);assert.match(workspace,/\/positionnement/);assert.match(workspace,/positioning === "completed" \|\| positioning === "validated"/)});
