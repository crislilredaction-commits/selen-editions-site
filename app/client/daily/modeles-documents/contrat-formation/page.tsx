"use client";

import { useEffect, useRef, useState } from "react";
import LoadingMascot from "@/components/ui/LoadingMascot";

const DOCUMENT_TYPE = "training_contract";
const TEMPLATE_NAME = "Contrat de formation professionnelle";
const BASE_CONTENT = `CONTRAT DE FORMATION PROFESSIONNELLE

Entre {{organisme}} et {{stagiaire}}, personne physique entreprenant la formation à titre individuel et à ses frais.

Action de formation
Intitulé : {{formation}}
Objet : {{objet}}
Programme : {{programme}}
Durée : {{duree}}
Effectif concerné : {{effectif}}
Prérequis / niveau de connaissances préalable : {{prerequis}}

Organisation de la formation
Dates et horaires : {{dates_horaires}}
Modalité et lieu / accès : {{modalite}}
Moyens pédagogiques et techniques : {{moyens}}
Modalités de contrôle des connaissances : {{evaluation}}
Sanction éventuelle de la formation : {{sanction}}
Formateur(s), titres ou références : {{formateurs}}

Conditions financières
Prix total : {{tarif}}
Modalités de paiement : {{paiement}}
Conditions financières en cas de cessation anticipée ou d'abandon : {{cessation}}

Rétractation et règlement
Le stagiaire dispose du délai légal de rétractation applicable au contrat de formation professionnelle. Aucun paiement ne peut être exigé avant l'expiration de ce délai. Les modalités de règlement postérieures sont précisées ci-dessus.

Force majeure
En cas de force majeure dûment reconnue empêchant le stagiaire de poursuivre la formation, seules les prestations effectivement dispensées sont dues à proportion de leur valeur prévue au présent contrat.

Fait à {{ville}}, le {{date}}.

Signature du stagiaire                         Signature de l'organisme`;

type TemplateRow = { id:string; document_type:string; template_name:string; template_version:number; status:string };

function htmlDoc(content:string){const safe=content.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Georgia,serif;color:#30251e;margin:42px;line-height:1.5}.content{white-space:pre-wrap}</style></head><body><h1>${TEMPLATE_NAME}</h1><div class="content">${safe}</div></body></html>`}
function downloadWord(content:string){const blob=new Blob([htmlDoc(content)],{type:"application/msword"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="contrat-formation-professionnelle.doc";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}

export default function TrainingContractTemplatePage(){
 const[template,setTemplate]=useState<TemplateRow|null>(null);const[content,setContent]=useState(BASE_CONTENT);const[loading,setLoading]=useState(true);const[saving,setSaving]=useState(false);const[error,setError]=useState("");const[message,setMessage]=useState("");const fileRef=useRef<HTMLInputElement>(null);
 async function load(){setLoading(true);setError("");const r=await fetch("/api/client/daily/document-templates",{cache:"no-store"});const b=await r.json().catch(()=>({}));if(!r.ok)setError(b.error??"Impossible de charger les modèles.");else setTemplate((b.templates??[]).find((x:TemplateRow)=>x.document_type===DOCUMENT_TYPE)??null);setLoading(false)}
 useEffect(()=>{void load()},[]);
 async function saveContent(){setSaving(true);setError("");setMessage("");const file=new File([htmlDoc(content)],"contrat-formation-professionnelle.doc",{type:"application/msword"});const fd=new FormData();fd.set("file",file);fd.set("document_type",DOCUMENT_TYPE);fd.set("template_name",TEMPLATE_NAME);const r=await fetch("/api/client/daily/document-templates",{method:"POST",body:fd});const b=await r.json().catch(()=>({}));if(!r.ok)setError(b.error??"Enregistrement impossible.");else{setMessage("Votre contrat personnalisé est enregistré comme nouvelle version active.");await load()}setSaving(false)}
 async function upload(){const file=fileRef.current?.files?.[0];if(!file)return setError("Choisissez un fichier Word ou PDF.");setSaving(true);setError("");setMessage("");const fd=new FormData();fd.set("file",file);fd.set("document_type",DOCUMENT_TYPE);fd.set("template_name",TEMPLATE_NAME);const r=await fetch("/api/client/daily/document-templates",{method:"POST",body:fd});const b=await r.json().catch(()=>({}));if(!r.ok)setError(b.error??"Import impossible.");else{setMessage("Le contrat importé devient la nouvelle version active, sans supprimer l’historique.");if(fileRef.current)fileRef.current.value="";await load()}setSaving(false)}
 if(loading)return <LoadingMascot message="Sélion prépare le modèle de contrat…"/>;
 return <main style={s.page}><section style={s.card}><p style={s.kicker}>Gestion documentaire · Contrat</p><h1 style={s.h1}>{TEMPLATE_NAME}</h1><p style={s.note}>Ce modèle est distinct de la convention. Il est destiné au cas où une personne physique entreprend la formation à titre individuel et à ses frais. La trame Selen reste éditable et versionnée.</p><p style={s.notice}><strong>Point de vigilance :</strong> ne remplacez pas automatiquement une convention par ce contrat pour une formation achetée par une entreprise ou un autre acheteur.</p>{error?<p role="alert" style={s.error}>{error}</p>:null}{message?<p role="status" style={s.success}>{message}</p>:null}<textarea aria-label="Contenu du contrat" value={content} onChange={e=>setContent(e.target.value)} rows={28} style={s.editor}/><div style={s.actions}><button type="button" onClick={()=>downloadWord(content)} style={s.secondary}>Télécharger la trame Word</button><button type="button" disabled={saving} onClick={()=>void saveContent()} style={s.primary}>{saving?"Enregistrement…":"Enregistrer ma version"}</button>{template?<a href={`/api/client/daily/document-templates?id=${encodeURIComponent(template.id)}`} target="_blank" rel="noreferrer" style={s.link}>Télécharger votre version v{template.template_version}</a>:null}</div></section><section style={s.card}><h2>Importer votre propre version</h2><p style={s.note}>Word ou PDF, 10 Mo maximum. La version précédente reste historisée.</p><div style={s.actions}><input ref={fileRef} type="file" accept=".pdf,.doc,.docx"/><button type="button" disabled={saving} onClick={()=>void upload()} style={s.primary}>Importer et versionner</button></div></section></main>
}
const s:Record<string,React.CSSProperties>={page:{maxWidth:1000,margin:"0 auto",padding:"1rem 1rem 5rem",display:"grid",gap:16,color:"#392a19"},card:{background:"#f8f0dc",border:"1px solid #d9c391",padding:"1.4rem 1.5rem",boxShadow:"0 8px 20px rgba(57,42,25,.06)"},kicker:{textTransform:"uppercase",letterSpacing:".14em",fontSize:11,fontWeight:800,color:"#9b682d",margin:0},h1:{fontSize:"clamp(1.8rem,5vw,2.8rem)",margin:".4rem 0"},note:{color:"#725e46",lineHeight:1.6},notice:{padding:".8rem 1rem",border:"1px solid #cdb785",background:"#fffaf0",lineHeight:1.5},editor:{width:"100%",boxSizing:"border-box",padding:12,border:"1px solid #cdb785",background:"#fffaf0",color:"#392a19",lineHeight:1.5},actions:{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginTop:12},primary:{minHeight:44,border:"1px solid #7a2e22",background:"#7a2e22",color:"#fff8e8",padding:".7rem .9rem",fontWeight:800},secondary:{minHeight:44,border:"1px solid #cdb785",background:"#fffaf0",color:"#392a19",padding:".7rem .9rem",fontWeight:800},link:{minHeight:44,display:"inline-flex",alignItems:"center",color:"#7a2e22",fontWeight:800},error:{padding:10,border:"1px solid #a64b3b",background:"#fff2ee",color:"#7d2e22"},success:{padding:10,border:"1px solid #7c9b68",background:"#f3faef",color:"#385c2d"}};
