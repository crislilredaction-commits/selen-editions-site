"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Phase = "before" | "during" | "after";
type Session = { id: string; formation_id: string; internal_reference?: string | null; start_date?: string | null; end_date?: string | null; status: string };
type Dossier = { session_id: string; status: string; completed_at?: string | null; updated_at: string };
type Item = { id:string; session_id:string; item_key:string; phase:Phase; responsibility:"client"|"shared"; label:string; description?:string|null; status:string; due_at?:string|null; note?:string|null; position:number };
type Formation = {
  id:string; title:string; global_objective?:string|null; learning_objectives?:unknown; target_audience?:string|null; prerequisites?:string|null;
  duration_hours?:number|null; duration_days?:number|null; modality?:string|null; modality_details?:string|null; access_delays?:string|null;
  registration_methods?:string|null; detailed_program?:string|null; detailed_program_document_url?:string|null; pedagogical_methods?:string|null;
  pedagogical_resources?:string|null; evaluation_methods?:string|null;
};

const phaseLabels: Record<Phase,string> = { before:"Avant la formation", during:"Pendant la formation", after:"Après la formation" };
const phaseOrder: Record<Phase,number> = { before:0, during:1, after:2 };
const statusLabels: Record<string,string> = { todo:"À faire", in_progress:"En cours", to_review:"À vérifier", validated:"Terminé", blocked:"Bloqué", not_applicable:"Non applicable · historique" };
const phases: Phase[] = ["before", "during", "after"];

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

function objectiveList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item : typeof item === "object" && item && "label" in item ? String((item as { label?: unknown }).label ?? "") : "").map((item) => item.trim()).filter(Boolean);
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
  const focusedItemId = searchParams.get("item") || "";

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
  const formationMap=useMemo(()=>new Map(formations.map((f)=>[f.id,f])),[formations]);
  const formation=session ? formationMap.get(session.formation_id) : undefined;
  const sessionItems=items.filter((i)=>i.session_id===selected);
  const currentPhase=session ? sessionPhase(session) : "before";
  const activeItems=sessionItems.filter((item)=>!isCompleted(item) && phaseOrder[item.phase] <= phaseOrder[currentPhase]);
  const completedItems=sessionItems.filter(isCompleted);
  const futureItems=sessionItems.filter((item)=>!isCompleted(item) && phaseOrder[item.phase] > phaseOrder[currentPhase]);
  const done=completedItems.length;
  const progress=sessionItems.length?Math.round(done/sessionItems.length*100):0;
  const dossier=dossiers.find((value)=>value.session_id===selected);
  const focusedItem=sessionItems.find((item)=>item.id===focusedItemId) ?? null;

  useEffect(()=>{
    if (!focusedItemId || !activeItems.some((item)=>item.id===focusedItemId)) return;
    const frame=window.requestAnimationFrame(()=>document.getElementById(`task-${focusedItemId}`)?.scrollIntoView({behavior:"smooth",block:"center"}));
    return ()=>window.cancelAnimationFrame(frame);
  },[focusedItemId,selected,activeItems]);

  function scrollToPhase(phase: Phase) {
    document.getElementById(`phase-${phase}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
      <label style={{display:"grid",gap:6,maxWidth:520,marginBottom:20}}>Session<select value={selected} onChange={(e)=>setSelected(e.target.value)} style={input}>{sessions.map((s)=><option key={s.id} value={s.id}>{formationMap.get(s.formation_id)?.title||"Formation"} · {s.internal_reference||"sans référence"}</option>)}</select></label>
      {session?<section style={{...card,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"flex-start"}}>
          <div><strong style={{fontSize:"1.08rem"}}>{formation?.title||"Formation"}</strong><p style={{margin:"6px 0 0"}}>{session.start_date || "Date à définir"}{session.end_date && session.end_date!==session.start_date?` → ${session.end_date}`:""}</p></div>
          <span style={phaseBadge}>{phaseLabels[currentPhase]}</span>
        </div>
        <div style={{marginTop:12}}>Progression globale : {done}/{sessionItems.length} · {progress}%{dossier?.status === "completed" ? " · Dossier clôturé" : ""}</div>
        <div style={{height:8,background:"rgba(120,90,60,.15)",marginTop:8,borderRadius:999,overflow:"hidden"}}><div style={{height:"100%",width:`${progress}%`,background:"var(--rust)"}}/></div>
        <div style={timeline} aria-label="Timeline de la session">{phases.map((phase)=>{
          const phaseItems=sessionItems.filter((item)=>item.phase===phase);
          const phaseDone=phaseItems.filter(isCompleted).length;
          const relation=phaseOrder[phase] < phaseOrder[currentPhase] ? "Passée" : phase===currentPhase ? "Phase actuelle" : "À venir";
          return <button key={phase} type="button" onClick={()=>scrollToPhase(phase)} style={{...timelineStep,...(phase===currentPhase?timelineCurrent:{})}}><span>{phaseLabels[phase]}</span><small>{relation} · {phaseDone}/{phaseItems.length} terminé{phaseDone>1?"s":""}</small></button>;
        })}</div>
        <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid var(--sepia-mid)",display:"flex",gap:8,flexWrap:"wrap"}}>
          <a href={`/client/daily/communications?session_id=${encodeURIComponent(session.id)}`} style={linkButton}>Communications & preuves</a>
          <a href={`/client/daily/suivi?session=${encodeURIComponent(session.id)}`} style={linkButton}>Suivi de session</a>
          <button type="button" onClick={()=>document.getElementById("programme-session")?.scrollIntoView({behavior:"smooth",block:"start"})} style={linkButtonAsButton}>Programme de formation</button>
        </div>
      </section>:null}

      {focusedItem && !isCompleted(focusedItem) && phaseOrder[focusedItem.phase] > phaseOrder[currentPhase] ? <div style={notice}>L’action demandée est bien rattachée à cette session, mais elle ne devient exigible que pendant la phase « {phaseLabels[focusedItem.phase]} ».</div> : null}
      {focusedItem && isCompleted(focusedItem) ? <div style={notice}>Cette action est déjà terminée et reste disponible dans l’historique du dossier.</div> : null}

      <section style={{marginTop:24}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"baseline",flexWrap:"wrap"}}><h2 style={{marginBottom:6}}>À faire maintenant</h2><span style={{color:"#70503b"}}>{activeItems.length} action{activeItems.length>1?"s":""}</span></div>
        {activeItems.length===0?<div style={empty}>Aucune action exigible pour le moment.</div>:<div style={{display:"grid",gap:12}}>{activeItems.map((item)=><ChecklistCard key={item.id} item={item} saving={saving===item.id} focused={focusedItemId===item.id} onComplete={complete}/>)}</div>}
        {futureItems.length>0?<p style={{color:"#70503b",fontSize:14}}>Étapes futures préparées : {futureItems.length}. Elles apparaîtront automatiquement lorsqu’elles deviendront exigibles.</p>:null}
      </section>

      <section style={{display:"grid",gap:14,marginTop:24}}>{phases.map((phase)=>{
        const phaseItems=sessionItems.filter((item)=>item.phase===phase);
        return <article key={phase} id={`phase-${phase}`} style={card}>
          <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",alignItems:"center"}}><h2 style={{margin:0,fontSize:"1.15rem"}}>{phaseLabels[phase]}</h2>{phase===currentPhase?<span style={phaseBadge}>Phase actuelle</span>:null}</div>
          {phaseItems.length===0?<p style={{marginBottom:0,color:"#70503b"}}>Aucune étape enregistrée pour cette phase.</p>:<div style={{display:"grid",gap:7,marginTop:12}}>{phaseItems.map((item)=><div key={item.id} style={{display:"flex",justifyContent:"space-between",gap:10,padding:".65rem .75rem",background:"white",border:"1px solid var(--sepia-mid)",borderRadius:9}}><span>{item.label}</span><strong style={{fontSize:13,color:isCompleted(item)?"#477044":"#80502f"}}>{isCompleted(item)?"✓ Terminé":phaseOrder[item.phase] > phaseOrder[currentPhase]?"À venir":statusLabels[item.status]||item.status}</strong></div>)}</div>}
        </article>;
      })}</section>

      <ProgramPanel formation={formation} />

      {completedItems.length>0?<details style={{...card,marginTop:24}}><summary style={{cursor:"pointer",fontWeight:800}}>Historique des actions terminées · {completedItems.length}</summary><div style={{display:"grid",gap:8,marginTop:12}}>{completedItems.map((item)=><article key={item.id} style={{padding:".75rem",border:"1px solid var(--sepia-mid)",background:"white"}}><div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}><strong>{item.label}</strong><span>{statusLabels[item.status]||item.status}</span></div>{item.note?<p style={{marginBottom:0}}>Note : {item.note}</p>:null}</article>)}</div></details>:null}
    </>}
  </main>;
}

function ProgramPanel({ formation }: { formation?: Formation }) {
  if (!formation) return null;
  const objectives=objectiveList(formation.learning_objectives);
  const hasContent=Boolean(formation.global_objective || objectives.length || formation.detailed_program || formation.detailed_program_document_url || formation.prerequisites || formation.target_audience || formation.pedagogical_methods || formation.pedagogical_resources || formation.evaluation_methods);
  return <section id="programme-session" style={{...card,marginTop:24}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"center"}}><div><p style={{margin:"0 0 4px",fontWeight:800,color:"var(--rust)"}}>Programme applicable à cette session</p><h2 style={{margin:0,fontSize:"1.25rem"}}>{formation.title}</h2></div>{formation.detailed_program_document_url?<a href={formation.detailed_program_document_url} target="_blank" rel="noreferrer" style={linkButton}>Ouvrir le document programme</a>:null}</div>
    {!hasContent?<p style={{color:"#70503b"}}>Le programme détaillé n’est pas encore renseigné pour cette formation.</p>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12,marginTop:16}}>
      {formation.global_objective?<ProgramField label="Objectif général" value={formation.global_objective}/>:null}
      {objectives.length?<div style={programField}><strong>Objectifs pédagogiques</strong><ul style={{margin:"7px 0 0",paddingLeft:20}}>{objectives.map((item)=><li key={item}>{item}</li>)}</ul></div>:null}
      {formation.target_audience?<ProgramField label="Public visé" value={formation.target_audience}/>:null}
      {formation.prerequisites?<ProgramField label="Prérequis" value={formation.prerequisites}/>:null}
      {(formation.duration_hours || formation.duration_days)?<ProgramField label="Durée" value={[formation.duration_hours?`${formation.duration_hours} h`:"",formation.duration_days?`${formation.duration_days} jour${Number(formation.duration_days)>1?"s":""}`:""].filter(Boolean).join(" · ")}/>:null}
      {formation.modality?<ProgramField label="Modalité" value={[formation.modality,formation.modality_details].filter(Boolean).join(" · ")}/>:null}
      {formation.registration_methods?<ProgramField label="Modalités d’inscription" value={formation.registration_methods}/>:null}
      {formation.access_delays?<ProgramField label="Délais d’accès" value={formation.access_delays}/>:null}
      {formation.pedagogical_methods?<ProgramField label="Méthodes pédagogiques" value={formation.pedagogical_methods}/>:null}
      {formation.pedagogical_resources?<ProgramField label="Moyens pédagogiques" value={formation.pedagogical_resources}/>:null}
      {formation.evaluation_methods?<ProgramField label="Évaluation" value={formation.evaluation_methods}/>:null}
      {formation.detailed_program?<div style={{...programField,gridColumn:"1 / -1"}}><strong>Programme détaillé</strong><p style={{whiteSpace:"pre-wrap",marginBottom:0}}>{formation.detailed_program}</p></div>:null}
    </div>}
  </section>;
}

function ProgramField({label,value}:{label:string;value:string}){
  return <div style={programField}><strong>{label}</strong><p style={{whiteSpace:"pre-wrap",marginBottom:0}}>{value}</p></div>;
}

function ChecklistCard({item,saving,focused,onComplete}:{item:Item;saving:boolean;focused:boolean;onComplete:(item:Item,note:string)=>Promise<void>}){
  const [note,setNote]=useState(item.note||"");
  useEffect(()=>{setNote(item.note||"");},[item.note]);
  return <article id={`task-${item.id}`} style={{...card,...(focused?focusedCard:{})}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><strong>{item.label}</strong><span>{phaseLabels[item.phase]}</span></div>
    {focused?<p style={{margin:"8px 0 0",fontSize:13,fontWeight:800,color:"var(--rust)"}}>Action à traiter maintenant</p>:null}
    {item.description?<p>{item.description}</p>:null}
    {item.due_at?<small>Échéance : {new Date(item.due_at).toLocaleDateString("fr-FR")}</small>:null}
    {item.status !== "todo" ? <p style={{margin:"8px 0 0",fontSize:13,color:"#70503b"}}>État actuel : {statusLabels[item.status]||item.status}</p> : null}
    <div style={{display:"grid",gridTemplateColumns:"minmax(220px,1fr) auto",gap:8,marginTop:12}}><input value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Note interne utile au suivi" style={input}/><button disabled={saving} onClick={()=>void onComplete(item,note)} style={button}>{saving?"Enregistrement…":"✓ Marquer terminé"}</button></div>
  </article>;
}

const card: React.CSSProperties={border:"1px solid var(--sepia-mid)",padding:"1rem",background:"var(--paper)",boxShadow:"0 4px 18px rgba(70,45,20,.05)",borderRadius:14};
const focusedCard: React.CSSProperties={border:"2px solid var(--rust)",background:"#fffaf0",boxShadow:"0 7px 24px rgba(110,62,31,.14)"};
const input: React.CSSProperties={border:"1px solid var(--sepia-mid)",padding:".65rem",background:"white",borderRadius:8,minWidth:0};
const button: React.CSSProperties={border:"1px solid var(--rust)",background:"var(--rust)",color:"white",padding:".65rem .9rem",cursor:"pointer",borderRadius:8,fontWeight:800};
const linkButton: React.CSSProperties={display:"inline-block",border:"1px solid var(--rust)",padding:".55rem .75rem",color:"var(--rust)",fontWeight:700,textDecoration:"none",borderRadius:8};
const linkButtonAsButton: React.CSSProperties={...linkButton,background:"transparent",cursor:"pointer",fontFamily:"inherit",fontSize:"inherit"};
const phaseBadge: React.CSSProperties={padding:".4rem .65rem",border:"1px solid var(--sepia-mid)",background:"white",borderRadius:999,fontWeight:800,color:"var(--rust)"};
const timeline: React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,marginTop:16};
const timelineStep: React.CSSProperties={display:"grid",gap:4,textAlign:"left",padding:".75rem",border:"1px solid var(--sepia-mid)",background:"white",borderRadius:10,cursor:"pointer",color:"#4e3524"};
const timelineCurrent: React.CSSProperties={border:"2px solid var(--rust)",background:"#fff8e8"};
const programField: React.CSSProperties={padding:".85rem",border:"1px solid var(--sepia-mid)",background:"white",borderRadius:10};
const empty: React.CSSProperties={padding:"1rem",border:"1px dashed var(--sepia-mid)",borderRadius:12,color:"#70503b"};
const notice: React.CSSProperties={padding:".85rem 1rem",border:"1px solid #c8aa78",background:"#fff8e8",borderRadius:10,color:"#654525",margin:"0 0 1rem"};
