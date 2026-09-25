import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const [manager,route,details,registrationPdf,portalPdf,navigation,pdf]=await Promise.all([
 read("components/daily/DailyFormationsManager.tsx"),
 read("app/api/client/daily/formations/route.ts"),
 read("components/daily/ProgramDetails.tsx"),
 read("app/api/daily-registration/[token]/program/route.ts"),
 read("app/api/daily-portal/[token]/program/route.ts"),
 read("components/daily/LearnerPhaseNavigation.tsx"),
 read("lib/server/dailyTrainingProgramPdf.ts"),
]);

test("le contenu détaillé est saisissable, prérempli et persistant en création/modification",()=>{
 assert.match(manager,/detailed_program\?: string \| null/);
 assert.match(manager,/detailed_program: formation\.detailed_program \?\? ""/);
 assert.match(manager,/label="Contenu détaillé de la formation \*"/);
 assert.match(manager,/value=\{form\.detailed_program\}/);
 assert.match(route,/detailed_program: creationMode === "selen_form" \? text\(body, "detailed_program"\) : ""/);
});

test("le PDF officiel contient le contenu détaillé et les éléments structurants",()=>{
 assert.match(pdf,/Contenu détaillé de la formation/);
 assert.match(pdf,/Objectifs pédagogiques/);
 assert.match(pdf,/Modalités d'évaluation/);
 assert.match(pdf,/formation\.detailed_program/);
});

test("le dossier d'inscription télécharge le programme complet en PDF",()=>{
 assert.match(details,/Télécharger le programme PDF/);
 assert.match(details,/daily-registration\/\$\{encodeURIComponent\(token\)\}\/program/);
 assert.match(registrationPdf,/Content-Type":"application\/pdf"/);
 assert.match(registrationPdf,/public_registration_token/);
 assert.match(registrationPdf,/registration_token/);
});

test("l'espace apprenant télécharge le même programme via un accès borné à sa session",()=>{
 assert.match(navigation,/Téléchargez le programme complet de votre formation au format PDF/);
 assert.match(navigation,/daily-portal\/\$\{token\}\/program/);
 assert.match(portalPdf,/portal_type!=="learner"/);
 assert.match(portalPdf,/\.eq\("id",access\.session_id\)/);
 assert.match(portalPdf,/\["revoked","expired"\]/);
 assert.match(portalPdf,/Content-Type":"application\/pdf"/);
});
