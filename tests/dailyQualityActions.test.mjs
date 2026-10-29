import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");

test("A4 présente un tableau unique actions correctives et améliorations",()=>{
 const page=read("app/client/daily/qualite/pilotage/page.tsx");
 assert.match(page,/Actions correctives & améliorations/);
 assert.match(page,/\["corrective_action","improvement"\]/);
 assert.doesNotMatch(page,/id:"correctives"/);
 assert.doesNotMatch(page,/id:"ameliorations"/);
});
test("A4 permet origine, responsable, échéance, statut et résultat",()=>{
 const page=read("app/client/daily/qualite/pilotage/page.tsx");
 for(const field of ["source_id","responsible_name","corrective_action_date","status","implemented_improvement"]) assert.ok(page.includes(field),field);
 assert.match(page,/Indépendante \/ sans événement lié/);
 assert.match(page,/Résultat \/ amélioration mise en œuvre/);
});
test("A4 valide que l’origine appartient au registre de la même organisation",()=>{
 const api=read("app/api/client/daily/quality-overview/route.ts");
 assert.match(api,/eq\("organisation_id",context\.organisationId\)/);
 assert.match(api,/Événement qualité d’origine invalide/);
 assert.match(api,/sourceType="quality_register"/);
});
test("A4 conserve assistance Studio et journalisation des écritures",()=>{
 const api=read("app/api/client/daily/quality-overview/route.ts");
 assert.match(api,/allowAssistanceWrite:true/);
 assert.match(api,/logAgentAssistanceAction/);
});
