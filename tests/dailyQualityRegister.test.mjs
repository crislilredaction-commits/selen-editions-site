import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");

test("A3 utilise un registre unique incident difficulté réclamation",()=>{
 const page=read("app/client/daily/qualite/pilotage/page.tsx");
 assert.match(page,/Incidents, difficultés & réclamations/);
 assert.match(page,/\["incident","difficulty","complaint"\]/);
 assert.doesNotMatch(page,/id:"reclamations"/);
});

test("A3 permet création, requalification et édition des champs métier",()=>{
 const api=read("app/api/client/daily/quality-overview/route.ts");
 for(const field of ["event_date","event_source","responsible_name","corrective_action","corrective_action_date"]) assert.ok(api.includes(field),field);
 assert.match(api,/daily_quality_register_create/);
 assert.match(api,/daily_quality_register_update/);
 assert.match(api,/category,title,observation/);
});

test("A3 migration conserve la table canonique et ajoute seulement les champs manquants",()=>{
 const migration=read("supabase/migrations/20260922120500_extend_daily_quality_register.sql");
 assert.match(migration,/alter table public\.daily_quality_actions/);
 assert.doesNotMatch(migration,/drop table|truncate|delete from/i);
 for(const field of ["event_date","event_source","responsible_name","corrective_action","corrective_action_date"]) assert.ok(migration.includes(field),field);
});

test("A3 est accessible via assistance Studio avec journalisation",()=>{
 const api=read("app/api/client/daily/quality-overview/route.ts");
 assert.match(api,/allowAssistanceWrite:true/);
 assert.match(api,/logAgentAssistanceAction/);
});
