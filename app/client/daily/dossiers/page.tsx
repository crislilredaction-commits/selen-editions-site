"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Phase = "before" | "during" | "after";
type Session = { id: string; formation_id: string; internal_reference?: string | null; start_date?: string | null; end_date?: string | null; status: string };
type Dossier = { session_id: string; status: string; completed_at?: string | null; updated_at: string };
type Item = { id:string; session_id:string; item_key:string; phase:Phase; responsibility:"client"|"shared"; label:string; description?:string|null; status:string; due_at?:string|null; note?:string|null; position:number };
type Formation = { id:string; title:string };

const phaseLabels: Record<Phase,string> = { before:"Avant la formation", during:"Pendant la formation", after:"Après la formation" };
const phaseOrder: Record<Phase,number> = { before:0, during:1, after:2 };
const statusLabels: Record<string,string> = { todo:"À faire", in_progress:"En cours", to_review:"À vérifier", validated:"Terminé", blocked:"Bloqué", not_applicable:"Non applicable · historique" };

function sessionPhase(session: Session): Phase {
  const now = new Date();
  const start = session.start_date ? new Date(`${session.start_date}T00:00:00`) : null;
  const end = session.end_date ? new Date(`${session.end_date}T23:59:59`) : start;
  if (start && now < start) return "before";
  if (end && now > end) return "after";
  return start ? "during" : "before";
}

function isCompleted(item: Item) {
  return item.status === "validated" || item.status === "not_applicable";
}

export default function DailyDossiersPage() {
  const searchParams = useSearchParams();
  const [sessions,setSessions]=useState<Session[]>([]);
  const [dossiers,setDossiers]=useState<Dossier[]>([]);
  const [items,setItems]=useState<Item[]>([]);
  const [formations,setFormations]=useState<Formation[]>([]);
  const [selected,setSelected]=useState("");
  const [error,setError]=useState("");
  const [saving,setSaving]=useState("");

  const load=useCallback(async()=>{
    setError("");
    const res=await assistanceFetch("/api/client/daily/session-dossiers", { cache: "no-store" });
    const body=await res.json().catch(()=>({}));
    if(!res.ok){setError(body.error||"Impossible de charger les dossiers.");return;}
    const loadedSessions: Session[] = body.sessions || [];
    setSessions(loadedSessions);
    setDossiers(body.dossiers||[]);
    setItems(body.checklist||[]);
    setFormations(body.formations||[]);
    setSelected((current) => {
      if (current && loadedSessions.some((session) => session.id === current)) return current;
      const requested = searchParams.get("session");
      if (requested && loadedSessions.some((session) => session.id === requested)) return requested;
      return loadedSessions[0]?.id || "";
    });
  },[searchParams]);

  useEffect(()=>{void load();},[load]);

  const session=sessions.find((s)=>s.id===selected);
  const formationMap=useMemo(()=>new Map(formations.map((f)=>[f.id,f.title])),[formations]);
  const sessionItems=items.filter((i)=>i.session_id===selected);
  const currentPhase=session ? sessionPhase(session) : "before";
  const activeItems=sessionItems.filter((item)=>!isCompleted(item) && phaseOrder[item.phase] <= phaseOrder[currentPhase]);
  const completedItems=sessionItems.filter(isCompleted);
  const futureItems=sessionItems.filter((item)=>!isCompleted(item) && phaseOrder[item.phase] > phaseOrder[currentPhase]);
  const done=completedItems.length;
  const progress=sessionItems.length?Math.round(done/sessionItems.length*100):0;
  const dossier=dossiers.find((value)=>value.session_id===selected);

  async function complete(item: Item, note: string){
    setSaving(item.id);setError("");
    const res=await assistanceFetch("/api/client/daily/session-dossiers",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({item_id:item.id,status:"validated",note})});
    const body=await res.json().catch(()=>({}));
    setSaving("");
    if(!res.ok){setError(body.error||"Mise à jour impossible.");return;}
    await load();
  }

  return <main style={{maxWidth:1100,margin:"0 auto",padding:"2rem 1rem 4rem"}}>
    <p style={{fontWeight:800,color:"var(--rust)",marginBottom:6}}>Selen Daily · Dossier complet</p>
    <h1 style={{marginTop:0}}>Dossier de session</h1>
    <p>Retrouvez ici uniquement les actions réellement à traiter maintenant. Les étapes futures restent préparées sans encombrer votre liste active.</p>
    {error?<p role="alert" style={{color:"#9b2c2c"}}>{error}</p>:null}
    {sessions.length===0?<section style={card}>Aucun dossier de session pour le moment.</section>:<>
      <label style={{display:"grid",gap:6,maxWidth:520,marginBottom:20}}>Session<select value={selected} onChange={(e)=>setSelected(e.target.value)} style={input}>{sessions.map((s)=><option key={s.id} value={s.id}>{formationMap.get(s.formation_id)||"Formation"} · {s.internal_reference||"sans référence"}</option>)}</select></label>
      {session?<section style={{...card,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"flex-start"}}>
          <div><strong style={{fontSize:"1.08rem"}}>{formationMap.get(session.formation_id)||"Formation"}</strong><p style={{margin:"6px 0 0"}}>{session.start_date || "Date à définir"}{session.end_date && session.end_date!==session.start_date?` → ${session.end_date}`:""}</p></div>
          <span style={phaseBadge}>{phaseLabels[currentPhase]}</span>
        </div>
        <div style={{marginTop:12}}>Progression globale : {done}/{sessionItems.length} · {progress}%{dossier?.status === "completed" ? " · Dossier clôturé" : ""}</div>
        <div style={{height:8,background:"rgba(120,90,60,.15)",marginTop:8,borderRadius:999,overflow:"hidden"}}><div style={{height:"100%",width:`${progress}%`,background:"var(--rust)"}}/></div>
        <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid var(--sepia-mid)",display:"flex",gap:8,flexWrap:"wrap"}}>
          <a href={`/client/daily/communications?session_id=${encodeURIComponent(session.id)}`} style={linkButton}>Communications & preuves</a>
          <a href={`/client/daily/suivi?session=${encodeURIComponent(session.id)}`} style={linkButton}>Suivi de session</a>
        </div>
      </section>:null}

      <section style={{marginTop:24}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"baseline",flexWrap:"wrap"}}><h2 style={{marginBottom:6}}>À faire maintenant</h2><span style={{color:"#70503b"}}>{activeItems.length} action{activeItems.length>1?"s":""}</span></div>
        {activeItems.length===0?<div style={empty}>Aucune action exigible pour le moment.</div>:<div style={{display:"grid",gap:12}}>{activeItems.map((item)=><ChecklistCard key={item.id} item={item} saving={saving===item.id} onComplete={complete}/>)}</div>}
        {futureItems.length>0?<p style={{color:"#70503b",fontSize:14}}>Étapes futures préparées : {futureItems.length}. Elles apparaîtront automatiquement lorsqu’elles deviendront exigibles.</p>:null}
      </section>

      {completedItems.length>0?<details style={{...card,marginTop:24}}><summary style={{cursor:"pointer",fontWeight:800}}>Historique des actions terminées · {completedItems.length}</summary><div style={{display:"grid",gap:8,marginTop:12}}>{completedItems.map((item)=><article key={item.id} style={{padding:".75rem",border:"1px solid var(--sepia-mid)",background:"white"}}><div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}><strong>{item.label}</strong><span>{statusLabels[item.status]||item.status}</span></div>{item.note?<p style={{marginBottom:0}}>Note : {item.note}</p>:null}</article>)}</div></details>:null}
    </>}
  </main>;
}

function ChecklistCard({item,saving,onComplete}:{item:Item;saving:boolean;onComplete:(item:Item,note:string)=>Promise<void>}){
  const [note,setNote]=useState(item.note||"");
  useEffect(()=>{setNote(item.note||"");},[item.note]);
  return <article style={card}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><strong>{item.label}</strong><span>{phaseLabels[item.phase]}</span></div>
    {item.description?<p>{item.description}</p>:null}
    {item.due_at?<small>Échéance : {new Date(item.due_at).toLocaleDateString("fr-FR")}</small>:null}
    {item.status !== "todo" ? <p style={{margin:"8px 0 0",fontSize:13,color:"#70503b"}}>État actuel : {statusLabels[item.status]||item.status}</p> : null}
    <div style={{display:"grid",gridTemplateColumns:"minmax(220px,1fr) auto",gap:8,marginTop:12}}><input value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Note interne utile au suivi" style={input}/><button disabled={saving} onClick={()=>void onComplete(item,note)} style={button}>{saving?"Enregistrement…":"✓ Marquer terminé"}</button></div>
  </article>;
}

const card: React.CSSProperties={border:"1px solid var(--sepia-mid)",padding:"1rem",background:"var(--paper)",boxShadow:"0 4px 18px rgba(70,45,20,.05)",borderRadius:14};
const input: React.CSSProperties={border:"1px solid var(--sepia-mid)",padding:".65rem",background:"white",borderRadius:8,minWidth:0};
const button: React.CSSProperties={border:"1px solid var(--rust)",background:"var(--rust)",color:"white",padding:".65rem .9rem",cursor:"pointer",borderRadius:8,fontWeight:800};
const linkButton: React.CSSProperties={display:"inline-block",border:"1px solid var(--rust)",padding:".55rem .75rem",color:"var(--rust)",fontWeight:700,textDecoration:"none",borderRadius:8};
const phaseBadge: React.CSSProperties={padding:".4rem .65rem",border:"1px solid var(--sepia-mid)",background:"white",borderRadius:999,fontWeight:800,color:"var(--rust)"};
const empty: React.CSSProperties={padding:"1rem",border:"1px dashed var(--sepia-mid)",borderRadius:12,color:"#70503b"};
