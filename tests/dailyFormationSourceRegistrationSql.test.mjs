import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const schema = await fs.readFile(new URL("./fixtures/dailyOwnPositioningSchema.sql", import.meta.url), "utf8");
const migration = await fs.readFile(new URL("../supabase/migrations/20261004190747_daily_client_source_registration.sql", import.meta.url), "utf8");
const id = n => "00000000-0000-4000-8000-" + String(n).padStart(12,"0");
const org=id(1), actor=id(2), old=id(3), next=id(4), kind="positioning_questionnaire_source";
const source = (extra={}) => ({id:next,kind,name:"Nouveau.docx",mime_type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",size_bytes:10*1024*1024,sha256:"a".repeat(64),previous_document_id:old,slot:id(8),storage_path:`daily/${org}/catalogue-sources/${kind}/${next}`,...extra});
test("PostgreSQL réel : import privé atomique, relecture, original intact et privilèges", async t => {
  const db=new PGlite(); t.after(()=>db.close()); await db.exec(schema); await db.exec(migration);
  await db.exec("create unique index qa_source_current on daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,logical_name) nulls not distinct where is_current; create unique index qa_source_version on daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,logical_name,version) nulls not distinct;");
  const row=async key=>(await db.query("select * from daily_documents where id=$1",[key])).rows[0];
  const save=async (payload=source(),of=org,user=actor)=>(await db.query("select * from daily_register_client_formation_source($1,$2,$3)",[of,user,JSON.stringify(payload)])).rows[0];
  async function seed() {
    await db.exec("truncate daily_documents");
    await db.query("insert into daily_documents(id,organisation_id,document_type,linked_object_type,linked_object_id,logical_name,version,bucket,storage_path,status,created_by,sha256,mime_type,size_bytes) values ($1,$2,$3,'organisation',$2,'ancien-original',3,'documents',$4,'to_check',$5,$6,'application/pdf',25)",[old,org,kind,`daily/${org}/old.pdf`,actor,"b".repeat(64)]);
  }
  await t.test("l’import n’altère pas l’original et une confirmation répétée renvoie la même version",async()=>{
    await seed(); const before=await row(old), created=await save();
    assert.equal(created.version,4); assert.equal(created.previous_document_id,old); assert.equal(created.is_current,true);
    assert.deepEqual(await row(old),before); assert.deepEqual(await save(),created);
    assert.equal((await db.query("select count(*)::int n from daily_documents")).rows[0].n,2);
  });
  await t.test("l’original signé et ses preuves restent strictement identiques",async()=>{
    await seed();await db.query("update daily_documents set status='signed',signed_at=now() where id=$1",[old]);
    const before=await row(old);await save();assert.deepEqual(await row(old),before);
  });
  for(const [reason,patch,of,user] of [
    ["autre OF",{},id(99),actor],["taille",{size_bytes:10485761},org,actor],["empreinte",{sha256:"forged"},org,actor],
    ["chemin",{storage_path:`daily/${id(99)}/bad`},org,actor],["copie apprenant",{kind:"learning_assessment_evidence"},org,actor],
    ["source absente",{previous_document_id:id(99)},org,actor],["acteur absent",{},org,null],
  ])await t.test(`refus ${reason} : aucune création ni altération`,async()=>{
    await seed();const before=await row(old);await assert.rejects(save(source(patch),of,user));
    assert.deepEqual(await row(old),before);assert.equal(await row(next),undefined);
  });
  await t.test("un document source archivé pendant le transfert empêche la confirmation",async()=>{
    await seed(); await db.query("update daily_documents set status='archived',archived_at=now() where id=$1",[old]);
    await assert.rejects(save(),/previous_source_changed/);assert.equal(await row(next),undefined);
  });
  await t.test("un réessai ne peut modifier l’empreinte, le nom ou l’acteur d’un document confirmé",async()=>{
    await seed();const before=await save();
    for(const extra of [{sha256:"c".repeat(64)},{name:"Autre.docx"},{size_bytes:8}])await assert.rejects(save(source(extra)),/source_changed/);
    await assert.rejects(save(source(),org,id(99)),/source_changed/);assert.deepEqual(await row(next),before);
  });
  await t.test("la fonction invoker possède un search_path fixe et reste réservée au serveur",async()=>{
    const result=(await db.query("select p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service from pg_proc p where p.proname='daily_register_client_formation_source'")).rows[0];
    assert.equal(result.prosecdef,false);assert.deepEqual(result.proconfig,["search_path=public, pg_temp"]);assert.equal(result.anon,false);assert.equal(result.authenticated,false);assert.equal(result.service,true);
  });
});
