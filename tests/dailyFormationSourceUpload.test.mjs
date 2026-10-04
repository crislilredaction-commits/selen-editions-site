import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const org=id(1), user=id(2), old=id(3), slot=id(4), token="isolated-assistance-token";
const kind="positioning_questionnaire_source", mime="application/pdf";
const shared=loadTypeScript("lib/daily/formationSourceUpload.ts");
function fixture(options={}) {
  const documents=[{id:old,organisation_id:org,document_type:kind,linked_object_type:"organisation",linked_object_id:org,bucket:"documents",storage_path:`daily/${org}/old.pdf`,formation_id:null,is_current:true,status:"signed",archived_at:null}];
  const assistance={id:id(8),agent_user_id:id(9),agent_email:"agent@example.invalid",organisation_id:org,dossier_id:null,status:"active",expires_at:"2099-01-01T00:00:00Z",token_hash:crypto.createHash("sha256").update(token).digest("hex")};
  const workspace={ok:true,user:{id:user},workspace:{membership:{organisation_id:org},capabilities:{trainings:true}}};
  const pools={daily_documents:documents,selen_agent_assistance_tokens:[assistance],agent_profiles:[{id:id(10),user_id:id(9),email:assistance.agent_email,is_active:true}],selen_admin_users:[],organisations:[{id:org,email:"client@example.invalid"}]};
  const files=new Map(),writes=[],tickets=[],downloads=[],infos=[];let timeOffset=0;
  const admin={
    auth:{admin:{listUsers:async()=>({data:{users:[{id:user,email:"client@example.invalid"}]},error:null})}},
    from(table){assert.ok(table in pools,table);const filters=[];const q={
      select(){return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},gt(k,v){filters.push(row=>row[k]>v);return q;},limit(){return q;},order(){return q;},
      or(v){filters.push(row=>v.split(",").some(part=>{const[k,,val]=part.split(".");return row[k]===val;}));return q;},
      async maybeSingle(){return{data:structuredClone(pools[table].find(row=>filters.every(f=>f(row)))??null),error:null};},
      update(){assert.equal(table,"selen_agent_assistance_tokens");return q;},
      then(resolve,reject){return q.maybeSingle().then(resolve,reject);},
      insert(){throw Error("No document insert outside atomic RPC");}
    };return q;},
    async rpc(name,args){assert.equal(name,"daily_register_client_formation_source");writes.push(structuredClone(args));if(options.commitError)return{data:null,error:{message:"isolated commit failure"}};
      return{data:{id:args.p_source.id},error:null};},
    storage:{from(bucket){assert.equal(bucket,"documents");return{
      async createSignedUploadUrl(path,opts){assert.equal(opts.upsert,false);tickets.push(path);return{data:{token:"private-upload-token"},error:null};},
      async upload(path,bytes,opts){assert.equal(opts.upsert,false);assert.equal(opts.cacheControl,"0");files.set(path,new Blob([bytes],{type:opts.contentType}));options.onUpload?.({workspace});return{data:{path},error:null};},
      async info(path){infos.push(path);const f=files.get(path);return f?{data:{size:f.size,contentType:f.type,...options.info},error:null}:{data:null,error:{message:"missing"}};},
      async download(path){downloads.push(path);options.onDownload?.({assistance,workspace,documents});return{data:files.get(path)??null,error:null};},
      remove(){throw Error("No destructive compensation allowed");}
    };}}
  };
  const globals={Request,Response,Buffer,Date:class extends Date{static now(){return Date.now()+timeOffset;}},process:{env:{SUPABASE_SERVICE_ROLE_KEY:"isolated-signing-fixture"}},fetch(){throw Error("Network forbidden");}};
  const assistanceModule=loadTypeScript("lib/server/agentAssistance.ts",{crypto:{default:crypto}},globals);
  const context=loadTypeScript("lib/server/dailyOrganisationContext.ts",{
    "@/lib/server/clientNdaAccess":{getAdminSupabase:()=>admin},"@/lib/server/agentAssistance":assistanceModule,
    "@/lib/server/dailyClientWorkspace":{getDailyClientWorkspace:async()=>options.assisted?{ok:false,status:401,error:"Connexion requise."}:workspace}
  },globals);
  const helper=loadTypeScript("lib/server/dailyFormationSourceUpload.ts",{"node:crypto":crypto,"@/lib/server/dailyOrganisationContext":context,"@/lib/daily/formationSourceUpload":shared,"@/lib/daily/ownPositioning":loadTypeScript("lib/daily/ownPositioning.ts")},globals);
  const route=loadTypeScript("app/api/client/daily/uploads/sources/route.ts",{"next/server":{NextResponse:Response},"@/lib/server/dailyOrganisationContext":context,"@/lib/server/dailyFormationSourceUpload":helper},globals);
  const legacy=loadTypeScript("app/api/client/daily/uploads/route.ts",{"node:crypto":crypto,"next/server":{NextResponse:Response},"@/lib/server/dailyOrganisationContext":context,"@/lib/server/dailyFormationSourceUpload":helper,"@/lib/daily/formationSourceUpload":shared},{...globals,File});
  const call=body=>route.POST(new Request("https://selen.invalid/api/client/daily/uploads/sources",{method:"POST",headers:{"Content-Type":"application/json",...(options.assisted?{"x-selen-agent-assistance":token}:{})},body:JSON.stringify(body)}));
  const bytes=Buffer.alloc(options.size??5*1024*1024,12), body={action:"prepare",kind,slot,name:"Original.pdf",mime_type:mime,size_bytes:bytes.length,sha256:crypto.createHash("sha256").update(bytes).digest("hex"),previous_document_url:`/api/client/daily/uploads?id=${old}`};
  return{call,body,bytes,files,writes,tickets,downloads,infos,documents,assistance,workspace,advance:ms=>timeOffset+=ms,
    async prepare(extra={}){const response=await call({...body,...extra});assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store");return response.json();},
    complete:authorization=>call({action:"complete",authorization}),
    async legacyUpload(file){documents[0].logical_name=`${kind}-${slot}`;const body=new FormData();body.set("file",file);body.set("kind",kind);body.set("slot",slot);return legacy.POST(new Request("https://selen.invalid/api/client/daily/uploads",{method:"POST",body}));}
  };
}
for(const assisted of [false,true])test(`original de 5 Mo, droits canoniques, vérification et relecture, assistance=${assisted}`,async()=>{
  const f=fixture({assisted}),before=structuredClone(f.documents),ticket=await f.prepare();
  assert.equal(f.writes.length,0);assert.ok(ticket.path.startsWith(`daily/${org}/catalogue-sources/${kind}/`));
  f.files.set(ticket.path,new Blob([f.bytes],{type:mime}));
  const response=await f.complete(ticket.authorization);assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.url,`/api/client/daily/uploads?id=${result.id}`);assert.equal(f.writes[0].p_organisation_id,org);assert.equal(f.writes[0].p_actor,user);assert.equal(f.writes[0].p_source.previous_document_id,old);
  assert.deepEqual(f.documents,before);assert.equal((await f.complete(ticket.authorization)).status,200);
  assert.equal(f.writes[1].p_source.id,result.id);assert.equal(f.writes[1].p_source.sha256,f.body.sha256);
});
for(const[reason,patch]of[
  ["taille nulle",{size_bytes:0}],["taille supérieure à 10 Mo",{size_bytes:10485761}],["taille décimale",{size_bytes:1.5}],
  ["empreinte invalide",{sha256:"no"}],["extension",{name:"script.html"}],["MIME contradictoire",{name:"Word.docx",mime_type:mime}],
  ["copie apprenant",{kind:"learning_assessment_evidence"}],["original d’un autre type",{kind:"training_program_source"}],["URL publique",{previous_document_url:"https://example.invalid/source.pdf"}],
])test(`ticket refusé (${reason}) sans création`,async()=>{const f=fixture();assert.ok((await f.call({...f.body,...patch})).status>=400);assert.equal(f.tickets.length,0);assert.equal(f.writes.length,0);});
test("un Word sans MIME est normalisé côté serveur et 10 Mo exacts sont acceptés",async()=>{const f=fixture({size:10*1024*1024});await f.prepare({name:"Original.DOCX",mime_type:""});assert.equal(f.tickets.length,1);});
for(const[reason,setup]of[
  ["capacité révoquée",f=>f.workspace.workspace.capabilities.trainings=false],
  ["OF modifié",f=>f.workspace.workspace.membership.organisation_id=id(99)],
  ["utilisateur modifié",f=>f.workspace.user.id=id(99)],
  ["autorisation expirée",f=>f.advance(31*60*1000)],
])test(`confirmation refusée (${reason}) avant lecture des octets`,async()=>{const f=fixture(),ticket=await f.prepare();setup(f);assert.ok((await f.complete(ticket.authorization)).status>=400);assert.equal(f.downloads.length,0);assert.equal(f.writes.length,0);});
test("une autorisation falsifiée est refusée, sans accès au stockage",async()=>{const f=fixture(),ticket=await f.prepare();const parts=ticket.authorization.split(".");parts[0]=Buffer.from(JSON.stringify({id:id(99)})).toString("base64url");assert.equal((await f.complete(parts.join("."))).status,400);assert.equal(f.infos.length,0);});
for(const options of [{info:{size:11*1024*1024}},{info:{contentType:"text/html"}}])test("les métadonnées du fichier sont contrôlées avant le téléchargement",async()=>{const f=fixture(options),ticket=await f.prepare();f.files.set(ticket.path,new Blob([f.bytes],{type:mime}));assert.equal((await f.complete(ticket.authorization)).status,409);assert.equal(f.downloads.length,0);assert.equal(f.writes.length,0);});
test("une empreinte différente bloque l’attachement et conserve l’original",async()=>{const f=fixture(),before=structuredClone(f.documents),ticket=await f.prepare();f.files.set(ticket.path,new Blob([Buffer.alloc(f.bytes.length,13)],{type:mime}));assert.equal((await f.complete(ticket.authorization)).status,409);assert.deepEqual(f.documents,before);assert.equal(f.writes.length,0);});
test("les droits sont revérifiés après la lecture complète du fichier",async()=>{const f=fixture({assisted:true,onDownload:({assistance})=>assistance.status="revoked"}),ticket=await f.prepare();f.files.set(ticket.path,new Blob([f.bytes],{type:mime}));assert.equal((await f.complete(ticket.authorization)).status,401);assert.equal(f.writes.length,0);});
test("un échec de confirmation garde le fichier privé pour un réessai, sans supprimer l’original",async()=>{const f=fixture({commitError:true}),ticket=await f.prepare();f.files.set(ticket.path,new Blob([f.bytes],{type:mime}));assert.equal((await f.complete(ticket.authorization)).status,409);assert.ok(f.files.has(ticket.path));assert.equal(f.documents.length,1);});
test("une page Daily déjà ouverte peut encore importer un Word, en conservant son original signé",async()=>{
  const f=fixture();const before=structuredClone(f.documents[0]);const response=await f.legacyUpload(new File(["Word original"],"Original.docx",{type:""}));
  assert.equal(response.status,200);assert.equal(f.writes.length,1);assert.equal(f.writes[0].p_source.previous_document_id,old);
  assert.equal(f.documents[0].is_current,before.is_current);assert.equal(f.documents[0].status,"signed");
});
test("une page Daily déjà ouverte ne confirme pas un import après révocation des droits",async()=>{
  const f=fixture({onUpload:({workspace})=>workspace.workspace.capabilities.trainings=false});
  assert.equal((await f.legacyUpload(new File(["Original"],"Original.pdf",{type:mime}))).status,403);assert.equal(f.writes.length,0);assert.equal(f.documents[0].is_current,true);
});

for(const[type,name,expected]of[["","Word.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document"],["application/octet-stream","Word.doc","application/msword"],["application/pdf","Original.pdf","application/pdf"]])test(`SDK réel : les 10 Mo et le MIME du Blob sont conservés (${name})`,async()=>{
  const bytes=Buffer.alloc(10*1024*1024,7),file=new File([bytes],name,{type}),mimeType=shared.dailyFormationSourceMime(name,type);assert.equal(mimeType,expected);
  let called=false;const client=createClient("https://isolated.invalid","isolated-anon-fixture",{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,init)=>{
    called=true;assert.match(String(url),/object\/upload\/sign\/documents\/private\/source/);const form=init.body;assert.ok(form instanceof FormData);
    const blob=form.get("");assert.equal(blob.type,expected);assert.equal(blob.size,bytes.length);assert.deepEqual(Buffer.from(await blob.arrayBuffer()),bytes);assert.equal(form.get("cacheControl"),"0");assert.equal(new Headers(init.headers).get("x-upsert"),"false");
    return Response.json({Key:"documents/private/source"});
  }}});
  const prepared=shared.prepareDailyFormationSourceUpload(file,mimeType);const result=await client.storage.from("documents").uploadToSignedUrl("private/source","isolated-token",prepared.body,prepared.options);assert.equal(result.error,null);assert.equal(called,true);
});

function uploadUi(f,options={}) {
  const state=[],effects=[],statuses=[],uploaded=[],calls=[];let cursor=0,tree,first=true;
  const jsx=(type,props)=>({type,props});
  const Page=loadTypeScript("components/daily/FormationSourceUpload.tsx",{
    "react/jsx-runtime":{jsx,jsxs:jsx},react:{
      useState(initial){const n=cursor++;if(!(n in state))state[n]=typeof initial==="function"?initial():initial;return[state[n],value=>state[n]=typeof value==="function"?value(state[n]):value];},
      useRef(initial){const n=cursor++;if(!(n in state))state[n]={current:initial};return state[n];},useEffect(fn){if(first)effects.push(fn);}
    },"@/components/AgentAssistanceBanner":{assistanceFetch:async(url,init)=>{
      assert.equal(url,"/api/client/daily/uploads/sources");assert.equal(typeof init.body,"string");const body=JSON.parse(init.body);calls.push(body);return f.call(body);
    }},"@/lib/daily/formationGuidance":{PROGRAMME_ACCEPT_ATTRIBUTE:".pdf,.doc,.docx"},"@/lib/daily/formationSourceUpload":shared,
    "@/app/lib/supabase/client":{createSupabaseBrowserClient:()=>({storage:{from:bucket=>({async uploadToSignedUrl(path,token,blob,opts){
      assert.equal(bucket,"documents");assert.equal(token,"private-upload-token");assert.equal(opts.upsert,false);assert.equal(opts.cacheControl,"0");
      if(options.transfer)await options.transfer();f.files.set(path,blob);return{error:options.transferError??null};
    }})}})}
  },{crypto:crypto.webcrypto,Blob,File,Uint8Array,Error}).default;
  const render=()=>{cursor=0;tree=Page({kind,label:"Original",value:`/api/client/daily/uploads?id=${old}`,onUploaded:value=>uploaded.push(value),onStateChange:value=>statuses.push(value)});first=false;};
  const nodes=node=>!node||typeof node!=="object"?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
  const find=predicate=>{const matches=nodes(tree).filter(predicate);assert.equal(matches.length,1);return matches[0];};
  render();const cleanups=effects.map(effect=>effect());
  return{render,find,statuses,uploaded,calls,unmount:()=>cleanups.forEach(fn=>fn?.()),
    upload(file){const input={files:[file],value:"original"};return find(n=>n.type==="input").props.onChange({target:input});},
    async click(label){find(n=>n.type==="button"&&n.props.children===label).props.onClick();await new Promise(resolve=>setImmediate(resolve));render();}
  };
}
test("composant réel : un Word de 10 Mo passe par deux petits JSON et le stockage privé",async()=>{
  const f=fixture(),h=uploadUi(f);await h.upload(new File([Buffer.alloc(10*1024*1024,17)],"Word.docx",{type:""}));h.render();
  assert.deepEqual(h.statuses,["pending","idle"]);assert.equal(h.uploaded.length,1);assert.equal(h.calls.length,2);
  assert.equal(h.calls[0].mime_type,"application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.ok(h.calls.every(body=>JSON.stringify(body).length<4096));assert.equal(f.writes[0].p_source.size_bytes,10*1024*1024);
});
test("composant réel : confirmation interrompue, réessai sans retransférer ni perdre l’original",async()=>{
  const options={commitError:true},f=fixture(options),h=uploadUi(f);await h.upload(new File([f.bytes],"Original.pdf",{type:mime}));h.render();
  assert.deepEqual(h.statuses,["pending","failed"]);assert.equal(h.uploaded.length,0);assert.equal(h.find(n=>n.type==="a").props.href,`/api/client/daily/uploads?id=${old}`);
  options.commitError=false;await h.click("Réessayer la vérification");assert.deepEqual(h.statuses,["pending","failed","pending","idle"]);assert.equal(h.uploaded.length,1);assert.equal(f.tickets.length,1);assert.equal(h.calls.length,3);
});
test("composant réel : abandon d’un import refusé conserve l’original et débloque le formulaire",async()=>{
  const f=fixture(),h=uploadUi(f);await h.upload(new File(["bad"],"Bad.html",{type:"text/html"}));h.render();
  assert.deepEqual(h.statuses,["pending","failed"]);await h.click("Abandonner cet import");assert.equal(h.statuses.at(-1),"idle");assert.equal(h.uploaded.length,0);assert.equal(h.calls.length,0);
});
test("composant réel : démontage pendant le transfert, aucune confirmation ni modification tardive",async()=>{
  let release,started;const waiting=new Promise(resolve=>started=resolve),f=fixture(),h=uploadUi(f,{transfer:()=>{started();return new Promise(resolve=>release=resolve);}});
  const pending=h.upload(new File([f.bytes],"Original.pdf",{type:mime}));await waiting;h.unmount();release();await pending;
  assert.equal(h.calls.length,1);assert.equal(h.uploaded.length,0);assert.equal(f.writes.length,0);
});
