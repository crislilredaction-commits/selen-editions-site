"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Session = { id: string; formation_id: string; internal_reference?: string | null; start_date?: string | null; end_date?: string | null; status: string };
type Dossier = { session_id: string; status: string; completed_at?: string | null; updated_at: string };
type Item = { id:string; session_id:string; item_key:string; phase:"before"|"during"|"after"; responsibility:"client"|"shared"; label:string; description?:string|null; status:string; due_at?:string|null; note?:string|null; position:number };
type Formation = { id:string; title:string };

const phaseLabels = { before:"Avant la formation", during:"Pendant la formation", after:"Après la formation" } as const;
const statusLabels: Record<string,string> = { todo:"À faire", in_progress:"En cours", to_review:"À vérifier", validated:"Validé", blocked:"Bloqué", not_applicable:"Non applicable" };

export default function DailyDossiersPage() {
  const [sessions,setSessions]=useState<Session[]>([]); const [dossiers,setDossiers]=useState<Dossier[]>([]); const [items,setItems]=useState<Item[]>([]); const [formations,setFormations]=useState<Formation[]>([]); const [selected,setSelected]=useState(""); const [error,setError]=useState(""); const [saving,setSaving]=useState("");
  const load=useCallback(async()=>{ setError(""); const res=await assistanceFetch("/api/client/daily/session-dossiers"); const body=await res.json().catch(()=>({})); if(!res.ok){setError(body.error||"Impossible de charger les dossiers.");return;} setSessions(body.sessions||[]);setDossiers(body.dossiers||[]);setItems(body.checklist||[]);setFormations(body.formations||[]); if(!selected && body.sessions?.[0]?.id) setSelected(body.sessions[0].id); },[selected]);
  useEffect(()=>{void load();},[load]);
  const session=sessions.find((s)=>s.id===selected); const formationMap=useMemo(()=>new Map(formations.map((f)=>[f.id,f.title])),[formations]); const sessionItems=items.filter((i)=>i.session_id===selected); const done=sessionItems.filter((i)=>["validated","not_applicable"].includes(i.status)).length; const progress=sessionItems.length?Math.round(done/sessionItems.length*100):0;
  async function update(item: Item, status: string, note: string){ setSaving(item.id);setError("");const res=await assistanceFetch("/api/client/daily/session-dossiers",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({item_id:item.id,status,note})});const body=await res.json().catch(()=>({}));setSaving("");if(!res.ok){setError(body.error||"Mise à jour impossible.");return;}await load(); }
  return <main style={{maxWidth:1100,margin:"0 auto",padding:"2rem 1rem 4rem"}}>
    <h1>Dossiers de session</h1><p>Suivez les actions à réaliser avant, pendant et après chaque session.</p>{error?<p style={{color:"#9b2c2c"}}>{error}</p>:null}
    {sessions.length===0?<section style={card}>Aucun dossier de session pour le moment.</section>:<>
      <label style={{display:"grid",gap:6,maxWidth:520,marginBottom:20}}>Session<select value={selected} onChange={(e)=>setSelected(e.target.value)} style={input}>{sessions.map((s)=><option key={s.id} value={s.id}>{formationMap.get(s.formation_id)||"Formation"} · {s.internal_reference||"sans référence"}</option>)}</select></label>
      {session?<section style={{...card,marginBottom:20}}><strong>{formationMap.get(session.formation_id)||"Formation"}</strong><div style={{marginTop:8}}>Progression : {done}/{sessionItems.length} · {progress}%</div><div style={{height:8,background:"rgba(120,90,60,.15)",marginTop:8}}><div style={{height:"100%",width:`${progress}%`,background:"var(--rust)"}}/></div></section>:null}
      {(["before","during","after"] as const).map((phase)=><section key={phase} style={{marginTop:24}}><h2>{phaseLabels[phase]}</h2><div style={{display:"grid",gap:12}}>{sessionItems.filter((i)=>i.phase===phase).map((item)=><ChecklistCard key={item.id} item={item} saving={saving===item.id} onSave={update}/>)}</div></section>)}
    </>}
  </main>;
}

function ChecklistCard({item,saving,onSave}:{item:Item;saving:boolean;onSave:(item:Item,status:string,note:string)=>Promise<void>}){const [status,setStatus]=useState(item.status);const [note,setNote]=useState(item.note||"");useEffect(()=>{setStatus(item.status);setNote(item.note||"");},[item.status,item.note]);return <article style={card}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><strong>{item.label}</strong><span>{statusLabels[item.status]||item.status}</span></div>{item.description?<p>{item.description}</p>:null}{item.due_at?<small>Échéance : {new Date(item.due_at).toLocaleDateString("fr-FR")}</small>:null}<div style={{display:"grid",gridTemplateColumns:"minmax(140px,180px) 1fr auto",gap:8,marginTop:12}}><select value={status} onChange={(e)=>setStatus(e.target.value)} style={input}>{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><input value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Note de suivi" style={input}/><button disabled={saving} onClick={()=>void onSave(item,status,note)} style={button}>{saving?"Enregistrement…":"Enregistrer"}</button></div></article>}

const card: React.CSSProperties={border:"1px solid var(--sepia-mid)",padding:"1rem",background:"var(--paper)",boxShadow:"0 4px 18px rgba(70,45,20,.05)"};
const input: React.CSSProperties={border:"1px solid var(--sepia-mid)",padding:".65rem",background:"white"};
const button: React.CSSProperties={border:"1px solid var(--rust)",background:"var(--rust)",color:"white",padding:".65rem .9rem",cursor:"pointer"};
