import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/client/daily/procedures/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/client/daily/procedures/page.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260830123100_create_daily_internal_procedures.sql", import.meta.url), "utf8");
const privileges = await readFile(new URL("../supabase/migrations/20260830123132_restrict_daily_internal_procedure_privileges.sql", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/client/daily/layout.tsx", import.meta.url), "utf8");

test("les trois procédures du cahier des charges sont les seules initialisées", () => {
  for (const type of ["learner_administration", "stakeholder_satisfaction", "absence_dropout"]) {
    assert.match(route, new RegExp(type));
    assert.match(migration, new RegExp(type));
  }
  assert.match(route, /Parcours administratif de l’apprenant et remise des documents/);
  assert.match(route, /Satisfaction des parties prenantes/);
  assert.match(route, /Prévention et gestion des absences et abandons/);
});

test("les écritures passent par l'espace organisme et ne sont pas ouvertes directement aux utilisateurs", () => {
  assert.match(route, /getDailyClientWorkspace\(\)/);
  assert.match(route, /capabilities\.legal_profile/);
  assert.match(migration, /revoke all on table public\.daily_internal_procedures from anon, authenticated/);
  assert.match(privileges, /revoke all on table public\.daily_internal_procedures from service_role/);
  assert.match(privileges, /grant select, insert, update on table public\.daily_internal_procedures to service_role/);
  assert.doesNotMatch(privileges, /grant delete/);
});

test("le serveur refuse une procédure sans déroulement même si l'interface est contournée", () => {
  assert.match(page, /name="steps"[\s\S]*required/);
  assert.match(route, /const steps = String\(body\.steps \?\? ""\)\.trim\(\)/);
  assert.match(route, /if \(!steps\)/);
  assert.match(route, /Le déroulement de la procédure est requis\./);
  assert.match(route, /steps,\n\s*responsibilities:/);
});

test("le client formalise ses propres procédures sans exposer la cuisine interne Selen", () => {
  assert.match(page, /parcours administratif/i);
  assert.match(page, /parties prenantes/i);
  assert.match(page, /absences, ruptures de parcours et abandons/i);
  assert.match(page, /sans exposer ses propres méthodes internes/);
});

test("l'accès reste contextuel depuis le suivi qualité", () => {
  assert.match(layout, /href: "\/client\/daily\/procedures"/);
  assert.match(layout, /label: "Procédures internes"/);
  assert.doesNotMatch(layout, /<nav/);
});
