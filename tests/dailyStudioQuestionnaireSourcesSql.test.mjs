import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const schema = await fs.readFile(new URL("./fixtures/dailyOwnPositioningSchema.sql", import.meta.url), "utf8");
const migration = await fs.readFile(new URL("../supabase/migrations/20261004103428_daily_studio_questionnaire_sources.sql", import.meta.url), "utf8");
const resubmission = await fs.readFile(new URL("../supabase/migrations/20261004104842_daily_studio_questionnaire_resubmission.sql", import.meta.url), "utf8");
const positioning = await fs.readFile(new URL("../supabase/migrations/20261002160230_daily_own_positioning_evidence.sql", import.meta.url), "utf8");
const id = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const ORG=id(1), USER=id(2), FORM=id(3), OLD=id(5), NEXT=id(30), FINAL=id(31);
const revision="2026-10-04T09:00:00.000Z", hash="a".repeat(64);

test("PostgreSQL réel : remplacement atomique, historique, relecture et privilèges", async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(schema);
  await db.exec(positioning);
  await db.exec(migration);
  await db.exec(resubmission);
  await db.exec("create unique index qa_current on daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,logical_name) nulls not distinct where is_current=true;");
  async function insert(table,row) {
    const keys=Object.keys(row), values=Object.values(row).map(v => v && typeof v==="object" ? JSON.stringify(v) : v);
    return (await db.query("insert into " + table + " (" + keys.join(",") + ") values (" + keys.map((_,i) => "$"+(i+1)).join(",") + ") returning *",values)).rows[0];
  }
  async function one(table,key) { return (await db.query("select * from "+table+" where id=$1",[key])).rows[0]; }
  async function seed(overrides={}) {
    await db.exec("truncate daily_documents,daily_formations,daily_sessions,daily_learners,daily_session_enrolments,daily_formation_registration_requests,daily_registration_responses,daily_registration_request_enrolments;");
    await insert("daily_formations", { id:FORM,organisation_id:ORG,user_id:USER,title:"Programme",global_objective:"Objectif",target_audience:"Public",prerequisites:"Aucun",duration_hours:7,duration_days:1,modality:"presentiel",modality_details:"presentiel",access_delays:"Deux jours",registration_methods:"Inscription",price:"100",detailed_program:"Contenu",accessibility:"Accessible",pedagogical_resources:"Supports",evaluation_methods:"Quiz",contact_phone:"0102030405",contact_email:"of@example.test",status:"validated",version:4,public_registration_token:"stable-link",updated_at:revision,positioning_mode:"off_platform",positioning_questionnaire_document_url:"/api/client/daily/uploads?id="+OLD,...overrides });
    await insert("daily_documents", { id:OLD,organisation_id:ORG,document_type:"positioning_questionnaire_source",linked_object_type:"organisation",linked_object_id:ORG,logical_name:"source-original",version:1,status:"to_check",bucket:"documents",storage_path:"daily/"+ORG+"/original.pdf",sha256:hash,mime_type:"application/pdf",size_bytes:10,metadata:{original_filename:"Original.pdf"} });
  }
  const source=(kind,key,extra={})=>({kind,id:key,storage_path:"daily/"+ORG+"/formation-sources/"+FORM+"/"+kind+"/"+key,mime_type:"application/pdf",size_bytes:25,sha256:hash,name:"Nouveau.pdf",...extra});
  const save=async (sources=[source("positioning",NEXT)],patch={},extra={}) => (await db.query(
    "select * from public.daily_save_formation_review_sources($1,$2,$3,$4,$5,$6,$7)",
    [FORM,extra.org || ORG,extra.revision || revision,extra.status || "validated",USER,JSON.stringify(patch),JSON.stringify(sources)]
  )).rows[0];
  await t.test("deux sources sont remplacées ensemble, programme et lien restent stables",async()=>{
    await seed(); const before=await one("daily_formations",FORM);
    const saved=await save([source("positioning",NEXT),source("assessment",FINAL)]);
    assert.equal(saved.id,FORM); assert.equal(saved.version,4); assert.equal(saved.title,before.title); assert.equal(saved.public_registration_token,"stable-link");
    assert.equal(saved.status,"review"); assert.equal(saved.positioning_questionnaire_document_url,"/api/client/daily/uploads?id="+NEXT);
    assert.equal(saved.learning_assessment_document_url,"/api/client/daily/uploads?id="+FINAL);
    const old=await one("daily_documents",OLD), next=await one("daily_documents",NEXT), final=await one("daily_documents",FINAL);
    assert.equal(old.is_current,false); assert.equal(old.storage_path,"daily/"+ORG+"/original.pdf"); assert.equal(old.sha256,hash);
    assert.equal(next.previous_document_id,OLD); assert.equal(next.version,2); assert.equal(next.status,"to_check");
    assert.equal(final.version,1); assert.equal(final.document_type,"learning_assessment_source"); assert.equal(final.formation_id,null);
    await assert.rejects(save(),/formation_changed/); assert.equal((await db.query("select count(*)::int n from daily_documents")).rows[0].n,3);
  });
  await t.test("une source corrigée renvoie la formation en revue et efface l’ancienne demande",async()=>{
    await seed({status:"correction_requested",validation_note:"Remplacer le questionnaire",agent_review_signaled_at:"2026-10-01T09:00:00Z"});
    const saved=await save([source("positioning",NEXT)],{title:"Programme corrigé"},{status:"correction_requested"});
    assert.equal(saved.status,"review");assert.equal(saved.validation_note,null);assert.ok(new Date(saved.agent_review_signaled_at).getTime()>new Date("2026-10-01T09:00:00Z").getTime());
    assert.equal(saved.title,"Programme corrigé");assert.equal(saved.public_registration_token,"stable-link");assert.equal(saved.version,4);assert.equal((await one("daily_documents",NEXT)).previous_document_id,OLD);
  });
  await t.test("une seconde source invalide annule aussi la première et son archivage",async()=>{
    await seed(); await assert.rejects(save([source("positioning",NEXT),source("assessment",FINAL,{sha256:"invalid"})]),/invalid_source/);
    assert.equal((await one("daily_documents",OLD)).is_current,true); assert.equal((await db.query("select count(*)::int n from daily_documents")).rows[0].n,1);
    assert.equal((await one("daily_formations",FORM)).status,"validated");
  });
  await t.test("mode mixte : questions Selen et document externe sont enregistrés ensemble",async()=>{
    await seed({positioning_mode:"selen",positioning_questionnaire_document_url:null});
    const questions=[{id:"p-stable",label:"Question corrigée",type:"free_text",options:[],help_text:"Aide",required:false,order:1}];
    const saved=await save([source("assessment",FINAL)],{positioning_questions:questions});
    assert.deepEqual(saved.positioning_questions,questions); assert.equal(saved.learning_assessment_document_url,"/api/client/daily/uploads?id="+FINAL);
  });
  await t.test("un original partagé par une formation dupliquée reste courant",async()=>{
    await seed(); const f=await one("daily_formations",FORM);
    await insert("daily_formations",{...f,id:id(40),public_registration_token:"other-link"});
    await save(); assert.equal((await one("daily_documents",OLD)).is_current,true);
    assert.equal((await one("daily_formations",id(40))).positioning_questionnaire_document_url,"/api/client/daily/uploads?id="+OLD);
  });
  await t.test("un original signé n’est jamais modifié",async()=>{
    await seed(); await db.query("update daily_documents set status='signed',signed_at=now() where id=$1",[OLD]);
    const before=await one("daily_documents",OLD); await save(); assert.deepEqual(await one("daily_documents",OLD),before);
  });
  for (const [label,sources,patch,extra] of [
    ["autre OF",[source("positioning",NEXT)],{},{org:id(99)}],
    ["ancien écran",[source("positioning",NEXT)],{},{revision:"2026-10-03T09:00:00Z"}],
    ["mode Selen forgé",[source("unknown",NEXT)],{},{}],
    ["doublon de mode",[source("positioning",NEXT),source("positioning",FINAL)],{},{}],
    ["chemin d’un autre OF",[source("positioning",NEXT,{storage_path:"daily/"+id(99)+"/private"})],{},{}],
    ["programme validé modifié",[source("positioning",NEXT)],{title:"forged"},{}],
    ["lien public forgé",[source("positioning",NEXT)],{public_registration_token:"forged"},{}],
  ]) await t.test(label+" : aucune mutation",async()=>{
    await seed(); const before=await one("daily_formations",FORM);
    await assert.rejects(save(sources,patch,extra)); assert.deepEqual(await one("daily_formations",FORM),before);
    assert.equal((await one("daily_documents",OLD)).is_current,true); assert.equal((await db.query("select count(*)::int n from daily_documents")).rows[0].n,1);
  });
  await t.test("copies remplies conservées et ancien positionnement retiré selon le trigger canonique",async()=>{
    await seed();
    await insert("daily_sessions",{id:id(50),organisation_id:ORG,formation_id:FORM,user_id:USER,start_date:"2099-01-01",end_date:"2099-01-02",modality:"presentiel"});
    await insert("daily_learners",{id:id(51),organisation_id:ORG,first_name:"Ada",last_name:"Test"});
    await insert("daily_session_enrolments",{id:id(52),organisation_id:ORG,session_id:id(50),learner_id:id(51),status:"pending",positioning_status:"not_started"});
    await insert("daily_documents",{id:id(53),organisation_id:ORG,formation_id:FORM,session_id:id(50),learner_id:id(51),enrolment_id:id(52),document_type:"positioning_evidence",linked_object_type:"enrolment",linked_object_id:id(52),logical_name:"Copie remplie",version:1,status:"to_check",bucket:"documents",storage_path:"daily/"+ORG+"/filled.pdf",mime_type:"application/pdf",sha256:hash,metadata:{source:"daily_learner_own_positioning",source_document_id:OLD,source_sha256:hash}});
    const before=await one("daily_documents",id(53)); await save();
    const after=await one("daily_documents",id(53)); assert.equal(after.storage_path,before.storage_path); assert.equal(after.sha256,before.sha256); assert.deepEqual(after.metadata,before.metadata);
    assert.equal(after.is_current,false); assert.equal((await one("daily_session_enrolments",id(52))).positioning_status,"not_started");
  });
  await t.test("fonction interne security invoker, inaccessible aux clients",async()=>{
    const [fn]=(await db.query("select prosecdef,has_function_privilege('anon',oid,'EXECUTE') a,has_function_privilege('authenticated',oid,'EXECUTE') u,has_function_privilege('service_role',oid,'EXECUTE') s from pg_proc where proname='daily_save_formation_review_sources'")).rows;
    assert.deepEqual(fn,{prosecdef:false,a:false,u:false,s:true});
    await db.exec("set role anon"); await assert.rejects(save(),/permission denied/); await db.exec("reset role");
  });
});
