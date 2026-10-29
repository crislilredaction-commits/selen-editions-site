import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const schema = await fs.readFile(new URL("./fixtures/dailyOwnPositioningSchema.sql", import.meta.url), "utf8");
const migration = await fs.readFile(new URL("../supabase/migrations/20261004190747_daily_client_source_registration.sql", import.meta.url), "utf8");
const sources = await fs.readFile(new URL("../supabase/migrations/20261004103428_daily_studio_questionnaire_sources.sql", import.meta.url), "utf8");
const retirement = await fs.readFile(new URL("../supabase/migrations/20261004194234_daily_client_source_retirement.sql", import.meta.url), "utf8");
const lineage = await fs.readFile(new URL("../supabase/migrations/20261004195805_daily_client_source_lineage.sql", import.meta.url), "utf8");
const id = n => "00000000-0000-4000-8000-" + String(n).padStart(12,"0");
const org=id(1), actor=id(2), old=id(3), next=id(4), kind="positioning_questionnaire_source";
const source = (extra={}) => ({id:next,kind,name:"Nouveau.docx",mime_type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",size_bytes:10*1024*1024,sha256:"a".repeat(64),previous_document_id:old,slot:id(8),storage_path:`daily/${org}/catalogue-sources/${kind}/${next}`,...extra});
test("PostgreSQL réel : import privé atomique, relecture, original intact et privilèges", async t => {
  const db=new PGlite(); t.after(()=>db.close()); await db.exec(schema); await db.exec(sources); await db.exec(migration); await db.exec(retirement);await db.exec(lineage);
  await db.exec("create unique index qa_source_current on daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,logical_name) nulls not distinct where is_current; create unique index qa_source_version on daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,logical_name,version) nulls not distinct;");
  const row=async key=>(await db.query("select * from daily_documents where id=$1",[key])).rows[0];
  const save=async (payload=source(),of=org,user=actor)=>{
    const target=(await db.query("select * from daily_formations where id=$1",[id(20)])).rows[0];
    const field=payload.kind==="training_program_source"?"detailed_program_document_url":payload.kind==="learning_assessment_source"?"learning_assessment_document_url":"positioning_questionnaire_document_url";
    return(await db.query("select * from daily_register_client_formation_source($1,$2,$3)",[of,user,JSON.stringify({source_formation_id:target?.id??null,expected_source_reference:target?.[field]??null,...payload})])).rows[0];
  };
  async function seed() {
    await db.exec("truncate daily_formations,daily_documents");
    await db.query("insert into daily_documents(id,organisation_id,document_type,linked_object_type,linked_object_id,logical_name,version,bucket,storage_path,status,created_by,sha256,mime_type,size_bytes,metadata) values ($1,$2,$3,'organisation',$2,'ancien-original',3,'documents',$4,'to_check',$5,$6,'application/pdf',25,$7)",[old,org,kind,`daily/${org}/old.pdf`,actor,"b".repeat(64),JSON.stringify({source:"daily_client",slot:id(8)})]);
  }
  await t.test("l’import n’altère pas l’original et une confirmation répétée renvoie la même version",async()=>{
    await seed(); const before=await row(old), created=await save();
    assert.equal(created.version,4); assert.equal(created.previous_document_id,old); assert.equal(created.is_current,true);
    assert.deepEqual(await row(old),before); assert.deepEqual(await save(),created);
    assert.equal((await db.query("select count(*)::int n from daily_documents")).rows[0].n,2);
  });
  async function formation(key=id(20),field="positioning_questionnaire_document_url",reference=old) {
    return db.query("insert into daily_formations(id,user_id,organisation_id,title,global_objective,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,detailed_program,pedagogical_resources,evaluation_methods,accessibility,contact_phone,contact_email,status,"+field+") values($1,$2,$3,'Programme','Objectif','Public','Aucun',7,1,'presentiel','presentiel','Deux jours','Inscription','100','Programme','Supports','Quiz','Accessible','0102030405','of@example.invalid','review',$4)",[key,actor,org,`/api/client/daily/uploads?id=${reference}`]);
  }
  for(const [type,field]of[["training_program_source","detailed_program_document_url"],[kind,"positioning_questionnaire_document_url"],["learning_assessment_source","learning_assessment_document_url"]]) {
    await t.test(`${type} : l’original ne passe dans l’historique qu’au moment de l’enregistrement`,async()=>{
      await seed();await db.query("update daily_documents set document_type=$1 where id=$2",[type,old]);await formation(id(20),field);
      const created=await save(source({kind:type,storage_path:`daily/${org}/catalogue-sources/${type}/${next}`}));assert.equal((await row(old)).is_current,true);
      await db.query("update daily_formations set "+field+"=$1 where id=$2",[`/api/client/daily/uploads?id=${created.id}`,id(20)]);
      assert.equal((await row(old)).is_current,false);assert.equal((await row(next)).is_current,true);
      await assert.rejects(db.query("update daily_formations set "+field+"=$1 where id=$2",[`/api/client/daily/uploads?id=${old}`,id(20)]),/document original a changé/);
    });
  }
  await t.test("une copie conserve l’original partagé jusqu’au remplacement de sa dernière référence",async()=>{
    await seed();await formation();await formation(id(21));await save();
    await db.query("update daily_formations set positioning_questionnaire_document_url=$1 where id=$2",[`/api/client/daily/uploads?id=${next}`,id(20)]);assert.equal((await row(old)).is_current,true);
    await db.query("update daily_formations set positioning_questionnaire_document_url=$1 where id=$2",[`/api/client/daily/uploads?id=${next}`,id(21)]);assert.equal((await row(old)).is_current,false);
  });
  await t.test("un original signé reste intact après l’enregistrement du remplacement",async()=>{
    await seed();await formation();await db.query("update daily_documents set status='signed',signed_at=now() where id=$1",[old]);const before=await row(old);await save();
    await db.query("update daily_formations set positioning_questionnaire_document_url=$1 where id=$2",[`/api/client/daily/uploads?id=${next}`,id(20)]);assert.deepEqual(await row(old),before);
  });
  await t.test("une transaction annulée conserve l’ancien lien et l’original courant",async()=>{
    await seed();await formation();await save();await db.exec("begin");
    await db.query("update daily_formations set positioning_questionnaire_document_url=$1 where id=$2",[`/api/client/daily/uploads?id=${next}`,id(20)]);await db.exec("rollback");
    assert.equal((await row(old)).is_current,true);assert.equal((await db.query("select positioning_questionnaire_document_url url from daily_formations where id=$1",[id(20)])).rows[0].url,`/api/client/daily/uploads?id=${old}`);
  });
  await t.test("une autre OF, un autre type ou un original retiré ne peut être attaché au catalogue",async()=>{
    await seed();await formation();await save();await db.query("update daily_documents set organisation_id=$1 where id=$2",[id(99),next]);
    const beforeFormation=(await db.query("select * from daily_formations where id=$1",[id(20)])).rows[0];
    const beforeDocuments=(await db.query("select * from daily_documents order by id")).rows;
    await assert.rejects(db.query("update daily_formations set title='Programme corrigé',detailed_program='Contenu corrigé',learning_assessment_mode='selen_quiz',learning_assessment_questions=$3,positioning_questionnaire_document_url=$1 where id=$2",[`/api/client/daily/uploads?id=${next}`,id(20),JSON.stringify([{id:"final",label:"Évaluation finale",type:"free_text"}])]),/document original a changé/);
    assert.deepEqual((await db.query("select * from daily_formations where id=$1",[id(20)])).rows[0],beforeFormation);
    assert.deepEqual((await db.query("select * from daily_documents order by id")).rows,beforeDocuments);
    assert.equal((await row(old)).is_current,true);
  });
  await t.test("l’original signé et ses preuves restent strictement identiques",async()=>{
    await seed();await formation();await db.query("update daily_documents set status='signed',signed_at=now() where id=$1",[old]);
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
  for(const [reason,metadata]of[["autre emplacement",{source:"daily_client",slot:id(99)}],["source Studio sans formation liée",{source:"daily_studio",slot:id(8)}]])await t.test(`lignée refusée : ${reason}`,async()=>{
    await seed();await db.query("update daily_documents set metadata=$1 where id=$2",[JSON.stringify(metadata),old]);
    await assert.rejects(save(),/previous_source_binding_changed/);assert.equal(await row(next),undefined);assert.equal((await row(old)).is_current,true);
  });
  await t.test("l’original Studio courant de la formation ouverte conserve sa lignée",async()=>{
    await seed();await formation();await db.query("update daily_documents set metadata=$1,formation_id=$3 where id=$2",[JSON.stringify({source:"daily_studio"}),old,id(20)]);
    const created=await save();assert.equal(created.previous_document_id,old);assert.equal(created.version,4);assert.equal(created.metadata.source_formation_id,id(20));
  });
  await t.test("le remplacement du lien pendant le transfert invalide l’ancienne autorisation",async()=>{
    await seed();await formation();const ticket=source({source_formation_id:id(20),expected_source_reference:`/api/client/daily/uploads?id=${old}`});
    await db.query("update daily_formations set positioning_questionnaire_document_url=null where id=$1",[id(20)]);
    await assert.rejects(save(ticket),/formation_source_changed/);assert.equal(await row(next),undefined);
  });
  await t.test("une formation étrangère ne peut servir à autoriser un prédécesseur",async()=>{
    await seed();await formation();await assert.rejects(save(source({source_formation_id:id(99),expected_source_reference:`/api/client/daily/uploads?id=${old}`})),/formation_source_changed/);assert.equal(await row(next),undefined);
  });
  await t.test("la fonction invoker possède un search_path fixe et reste réservée au serveur",async()=>{
    const result=(await db.query("select p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service from pg_proc p where p.proname='daily_register_client_formation_source'")).rows[0];
    assert.equal(result.prosecdef,false);assert.deepEqual(result.proconfig,["search_path=public, pg_temp"]);assert.equal(result.anon,false);assert.equal(result.authenticated,false);assert.equal(result.service,true);
  });
});
