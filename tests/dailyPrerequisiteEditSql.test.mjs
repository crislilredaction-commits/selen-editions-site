import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await fs.readFile(new URL("../supabase/migrations/20261003225500_guard_daily_prerequisite_edit.sql", import.meta.url), "utf8");
const requirement = [{ id: "diploma", label: "Diplôme", description: "Copie lisible", required: true }];

test("PostgreSQL réel : prérequis modifiables et candidatures existantes protégées", async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create table public.daily_formations(id text primary key, title text, prerequisite_mode text not null default 'none', prerequisite_requirements jsonb not null default '[]', prerequisites text);
    create table public.daily_formation_registration_requests(id text primary key, formation_id text not null references public.daily_formations(id), decision_status text not null, prerequisites_validated boolean, analysis jsonb);
    create table public.daily_prerequisite_evidence(id text primary key, registration_request_id text references public.daily_formation_registration_requests(id), status text, document_id text, review_comment text);
  `);
  await db.exec(`begin;${migration}commit;`);
  async function seed(status = null, mode = "required") {
    await db.exec("truncate public.daily_prerequisite_evidence,public.daily_formation_registration_requests,public.daily_formations");
    await db.query("insert into public.daily_formations values ('f','Formation',$1,$2,$3)", [mode, JSON.stringify(mode === "none" ? [] : requirement), mode === "none" ? "Aucun prérequis" : "Niveau 4"]);
    if (status) {
      await db.query("insert into public.daily_formation_registration_requests values ('r','f',$1,true,$2)", [status, JSON.stringify({ original: "Analyse humaine" })]);
      await db.query("insert into public.daily_prerequisite_evidence values ('e','r','verified','private-document','Validation humaine')");
    }
  }
  const snapshot = async () => ({
    formation: (await db.query("select * from public.daily_formations")).rows,
    requests: (await db.query("select * from public.daily_formation_registration_requests")).rows,
    evidence: (await db.query("select * from public.daily_prerequisite_evidence")).rows,
  });
  for (const status of ["pending", "agent_review", "ready_for_of"]) await t.test(`${status} : changer la déclaration laisse toutes les preuves intactes`, async () => {
    for (const query of [
      "update public.daily_formations set prerequisite_mode='none',prerequisite_requirements='[]' where id='f'",
      "update public.daily_formations set prerequisite_requirements='[{\"id\":\"new\",\"label\":\"Expérience\"}]' where id='f'",
      "update public.daily_formations set prerequisites='Niveau 5' where id='f'",
    ]) {
      await seed(status); const before = await snapshot();
      await assert.rejects(db.exec(query), error => error.code === "PSE01" && /candidatures en cours/.test(error.message));
      assert.deepEqual(await snapshot(), before);
    }
  });
  await t.test("une nouvelle exigence ne s’applique pas à une candidature sans prérequis déjà ouverte", async () => {
    await seed("pending", "none");
    await assert.rejects(db.query("update public.daily_formations set prerequisite_mode='required',prerequisite_requirements=$1,prerequisites='Niveau 4' where id='f'", [JSON.stringify(requirement)]), error => error.code === "PSE01");
  });
  await t.test("une modification ordinaire ne touche pas la validation ni les fichiers", async () => {
    await seed("ready_for_of"); const before = await snapshot();
    await db.query("update public.daily_formations set title='Intitulé corrigé',prerequisite_mode='required',prerequisite_requirements=$1,prerequisites='Niveau 4' where id='f'", [JSON.stringify(requirement)]);
    const after = await snapshot(); assert.equal(after.formation[0].title, "Intitulé corrigé");
    assert.deepEqual(after.requests, before.requests); assert.deepEqual(after.evidence, before.evidence);
  });
  await t.test("normaliser le texte aucun prérequis reste possible sans changer sa déclaration", async () => {
    await seed("pending", "none");
    await db.exec("update public.daily_formations set prerequisites='Aucun prérequis.' where id='f'");
  });
  for (const status of [null, "accepted", "refused"]) await t.test(`${status ?? "sans candidature"} : les prérequis peuvent évoluer sans réécrire l’historique`, async () => {
    await seed(status); const before = await snapshot();
    await db.exec("update public.daily_formations set prerequisite_mode='none',prerequisite_requirements='[]',prerequisites='Aucun prérequis' where id='f'");
    const after = await snapshot(); assert.equal(after.formation[0].prerequisite_mode, "none");
    assert.deepEqual(after.requests, before.requests); assert.deepEqual(after.evidence, before.evidence);
  });
  await t.test("une candidature d’une autre formation ne bloque pas cette modification", async () => {
    await seed("pending");
    await db.exec("insert into public.daily_formations values ('other','Autre','none','[]','Aucun prérequis'); update public.daily_formations set prerequisite_mode='required',prerequisite_requirements='[{\"id\":\"a\",\"label\":\"Attestation\"}]' where id='other'");
  });
  await t.test("la protection reste un trigger privé avec le verrou de formation", async () => {
    const [{ definition, anon, authenticated }] = (await db.query("select pg_get_functiondef(p.oid) definition,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='guard_daily_formation_prerequisite_edit'")).rows;
    assert.equal(anon, false); assert.equal(authenticated, false); assert.match(definition, /for update/i);
  });
});
