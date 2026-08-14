"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Session = { id:string; internal_reference?:string|null; start_date?:string|null; end_date?:string|null; daily_formations?:{title?:string|null}|null };
type DocumentRow = { id:string; document_type:string; version:number; status:string; metadata?:Record<string,unknown>|null; created_at:string };

const labels:Record<string,string> = {
  attendance_report:"Relevé de présence",
  completion_certificate:"Certificat de réalisation",
  satisfaction_summary:"Synthèse de satisfaction",
};
const statusLabels:Record<string,string> = {
  draft:"Brouillon", to_check:"À vérifier par Selen", to_validate:"À valider", validated:"Validé", published:"Publié", signed:"Signé", correction_requested:"Correction demandée", active:"Actif", archived:"Archivé",
};

export default function DailyPosttrainingDocumentsPage(){
  const [sessions,setSessions]=useState<Session[]>([]);
  const [sessionId,setSessionId]=useState("");
  const [documents,setDocuments]=useState<DocumentRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [generating,setGenerating]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const loadDocuments = useCallback(async(id:string)=>{
    if(!id){setDocuments([]);return;}
    const r=await assistanceFetch(`/api/client/daily/posttraining-documents?session_id=${encodeURIComponent(id)}`,{cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(r.ok)setDocuments(d.documents??[]); else setError(d.error??"Documents indisponibles.");
  },[]);

  const load = useCallback(async()=>{
    setLoading(true); setError("");
    try {
      const r=await assistanceFetch("/api/client/daily/sessions",{cache:"no-store"});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error??"Sessions indisponibles.");
      const rows=(d.sessions??[]) as Session[];
      setSessions(rows);
      setSessionId((current)=>current||rows[0]?.id||"");
    } catch(c){setError(c instanceof Error?c.message:"Chargement impossible.");}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{void load();},[load]);
  useEffect(()=>{void loadDocuments(sessionId);},[sessionId,loadDocuments]);
  const selected=useMemo(()=>sessions.find((s)=>s.id===sessionId)??null,[sessions,sessionId]);

  async function generate(event:FormEvent){
    event.preventDefault(); if(!sessionId)return;
    setGenerating(true); setError(""); setMessage("");
    try{
      const r=await assistanceFetch("/api/client/daily/posttraining-documents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:sessionId})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error??"Génération impossible.");
      setMessage(`${d.count??0} document(s) généré(s) et transmis à Selen pour vérification.`);
      await loadDocuments(sessionId);
    }catch(c){setError(c instanceof Error?c.message:"Génération impossible.");}
    finally{setGenerating(false);}
  }

  return <main style={{maxWidth:1100,margin:"0 auto",padding:"28px 20px"}}>
    <p style={{fontSize:12,fontWeight:700,color:"var(--rust)"}}>SELEN DAILY</p>
    <h1>Documents de fin de formation</h1>
    <p style={{color:"var(--ink-soft)",maxWidth:780}}>Générez le relevé de présence, un certificat de réalisation par apprenant actif et la synthèse de satisfaction depuis les données réellement enregistrées dans Daily. Chaque régénération crée une nouvelle version et passe par la vérification Selen.</p>
    {error&&<div style={{padding:12,border:"1px solid #b24c3d",margin:"14px 0"}}>{error}</div>}
    {message&&<div style={{padding:12,border:"1px solid var(--sepia-mid)",margin:"14px 0"}}>{message}</div>}
    <form onSubmit={generate} style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end",margin:"22px 0"}}>
      <label style={{display:"grid",gap:6,flex:"1 1 320px"}}>Session
        <select value={sessionId} onChange={(e)=>setSessionId(e.target.value)} disabled={loading||generating} style={{padding:10}}>
          <option value="">Choisir une session</option>
          {sessions.map((s)=><option key={s.id} value={s.id}>{s.daily_formations?.title??"Formation"} · {s.internal_reference??s.start_date??"Session"}</option>)}
        </select>
      </label>
      <button type="submit" disabled={!sessionId||generating} style={{padding:"11px 16px"}}>{generating?"Génération…":"Générer / régénérer les documents"}</button>
    </form>
    {selected&&<div style={{padding:12,background:"rgba(201,160,85,.08)",border:"1px solid var(--sepia-mid)",marginBottom:18}}><strong>{selected.daily_formations?.title??"Formation"}</strong> · {selected.start_date??""} {selected.end_date&&selected.end_date!==selected.start_date?`→ ${selected.end_date}`:""}</div>}
    <section style={{display:"grid",gap:10}}>
      {documents.length===0?<div style={{padding:18,border:"1px solid var(--sepia-mid)"}}>Aucun document de fin généré pour cette session.</div>:documents.map((doc)=><article key={doc.id} style={{padding:14,border:"1px solid var(--sepia-mid)",background:"var(--paper)"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><strong>{labels[doc.document_type]??doc.document_type}</strong>{typeof doc.metadata?.learner_name==="string"?` · ${doc.metadata.learner_name}`:""}<div style={{fontSize:12,marginTop:4}}>Version {doc.version} · {statusLabels[doc.status]??doc.status}</div></div><a href={`/api/client/daily/posttraining-documents/download?id=${encodeURIComponent(doc.id)}`} target="_blank" rel="noreferrer">Télécharger</a></div></article>)}
    </section>
  </main>;
}
