"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import LoadingMascot from "@/components/ui/LoadingMascot";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Session={id:string;start_date?:string|null;daily_formations?:{title?:string|null}|null;status?:string|null};
const TYPES=[
 ["training_agreement","Convention de formation"],
 ["convocation","Convocation"],
 ["attendance_sheet","Feuille d'émargement"],
 ["completion_certificate","Attestation de fin de formation"],
 ["achievement_certificate","Certificat de réalisation"],
 ["internal_rules","Règlement intérieur"],
 ["welcome_booklet","Livret d'accueil Selen"],
] as const;
export default function DailyManualDocumentVersionsPage(){
 const[sessions,setSessions]=useState<Session[]>([]);const[loading,setLoading]=useState(true);const[saving,setSaving]=useState(false);const[error,setError]=useState("");const[message,setMessage]=useState("");const fileRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{assistanceFetch("/api/client/daily/sessions",{cache:"no-store"}).then(async r=>{const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error??"Sessions indisponibles.");setSessions((b.sessions??[]).filter((x:Session)=>x.status!=="archived"))}).catch(e=>setError(e instanceof Error?e.message:"Chargement impossible.")).finally(()=>setLoading(false))},[]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget),file=fileRef.current?.files?.[0];if(!file){setError("Choisissez le PDF à importer.");return}f.set("file",file);setSaving(true);setError("");setMessage("");const r=await fetch("/api/client/daily/manual-documents",{method:"POST",body:f});const b=await r.json().catch(()=>({}));if(!r.ok)setError(b.error??"Import impossible.");else{setMessage(`PDF enregistré en version ${b.document?.version??"suivante"}. La version précédente reste conservée dans l'historique.`);if(fileRef.current)fileRef.current.value=""}setSaving(false)}
 if(loading)return <LoadingMascot message="Sélion prépare l'historique documentaire…"/>;
 return <main style={s.page}><section style={s.card}><p style={s.kicker}>Selen Daily · Dossier apprenant</p><h1 style={s.h1}>Importer ou remplacer un PDF</h1><p style={s.text}>Utilisez cet écran lorsqu'un document du dossier doit être remplacé par une version signée, corrigée ou personnalisée. Chaque import crée une nouvelle version : l'ancienne reste conservée et n'est jamais écrasée.</p>{error?<p style={s.error}>{error}</p>:null}{message?<p style={s.ok}>{message}</p>:null}<form onSubmit={submit} style={s.form}><label>Session<select name="session_id" required style={s.input}><option value="">Choisir une session</option>{sessions.map(x=><option key={x.id} value={x.id}>{x.daily_formations?.title??"Formation"} · {x.start_date??"date à définir"}</option>)}</select></label><label>Type de document<select name="document_type" required style={s.input}>{TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Apprenant / bénéficiaire<input name="beneficiary" placeholder="Nom et prénom" style={s.input}/></label><label>Nouvelle version PDF<input ref={fileRef} type="file" accept="application/pdf,.pdf" required style={s.input}/></label><button disabled={saving} style={s.button}>{saving?"Import en cours…":"Enregistrer cette nouvelle version"}</button></form><p style={s.note}>PDF uniquement, 10 Mo maximum. La nouvelle version est marquée « à vérifier » afin de conserver le contrôle documentaire avant utilisation définitive.</p></section></main>}
const s:Record<string,React.CSSProperties>={page:{maxWidth:900,margin:"0 auto",padding:"1rem 1rem 5rem",color:"var(--ink)"},card:{border:"1px solid var(--sepia-mid)",background:"var(--paper)",padding:"1.4rem"},kicker:{color:"var(--rust)",fontWeight:800,fontSize:12},h1:{fontFamily:"Georgia,serif",fontSize:"clamp(2rem,5vw,3rem)",margin:".35rem 0"},text:{color:"var(--ink-soft)",lineHeight:1.6},form:{display:"grid",gap:"1rem",marginTop:"1.2rem"},input:{display:"block",width:"100%",marginTop:6,padding:10,border:"1px solid var(--sepia-mid)",background:"white"},button:{padding:".8rem 1rem",fontWeight:800,border:"1px solid var(--rust)",background:"var(--rust)",color:"white",cursor:"pointer"},note:{fontSize:13,color:"var(--ink-soft)"},error:{border:"1px solid #a64b3b",background:"#fff2ee",padding:10,color:"#7d2e22"},ok:{border:"1px solid #668153",background:"#f3f8ef",padding:10,color:"#455a3b"}};
