"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import LoadingMascot from "@/components/ui/LoadingMascot";

type Formation = { id:string; title:string; status:string; spontaneous_registration_task_status?:string|null };
type Session = { id:string; formation_id:string; start_date?:string|null; status:string; modality?:string|null; distance_mode?:string|null; daily_formations?:{title?:string|null}|null };
type ActionItem = { id:string; priority:"high"|"medium"|"normal"; title:string; detail:string; href:string; sessionLabel?:string|null };
type Onboarding = {
  organisation_name?:string|null;
  manager_first_name?:string|null;
  manager_last_name?:string|null;
  nda_number?:string|null;
  qualiopi_status?:string|null;
  quality_tracking_enabled?:boolean|null;
  first_nda_year?:boolean|null;
  insee_document_url?:string|null;
  qualiopi_certificate_url?:string|null;
  nda_or_bpf_document_url?:string|null;
};
type Workspace = { organisation?:Record<string,unknown>|null; trainers?:Array<Record<string,unknown>> };

const rank:Record<ActionItem["priority"],number>={high:0,medium:1,normal:2};

function formatDate(value?:string|null){
  if(!value)return"Date à définir";
  const d=new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric"}).format(d);
}

function formatModality(s:Session){
  if(s.modality==="distanciel"&&s.distance_mode==="asynchrone")return"Distanciel à votre rythme";
  if(s.modality==="distanciel")return"Distanciel en direct";
  if(s.modality==="presentiel")return"Présentiel";
  if(s.modality==="mixte")return"Mixte";
  return"Modalité à préciser";
}

function missingDocumentActions(onboarding:Onboarding|null):ActionItem[]{
  if(!onboarding)return[];
  const items:ActionItem[]=[];
  const add=(id:string,title:string)=>items.push({id:`missing-doc:${id}`,priority:"medium",title,detail:"Cette pièce administrative manque encore dans le profil de votre organisme.",href:"/client/daily/mon-compte#documents-organisme",sessionLabel:"Profil organisme"});
  if(!onboarding.insee_document_url)add("insee","Avis INSEE à fournir");
  if(onboarding.qualiopi_status==="yes"&&!onboarding.qualiopi_certificate_url)add("qualiopi","Certificat Qualiopi à fournir");
  if(Boolean(onboarding.nda_number?.trim())&&!onboarding.first_nda_year&&!onboarding.nda_or_bpf_document_url)add("bpf","Dernier BPF à fournir");
  return items;
}

export default function DailyDashboardOverviewV2(){
  const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
  const[formations,setFormations]=useState<Formation[]>([]);
  const[sessions,setSessions]=useState<Session[]>([]);
  const[actions,setActions]=useState<ActionItem[]>([]);
  const[onboarding,setOnboarding]=useState<Onboarding|null>(null);
  const[workspace,setWorkspace]=useState<Workspace|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");
  const[signingOut,setSigningOut]=useState(false);

  useEffect(()=>{let cancelled=false;(async()=>{try{
    const responses=await Promise.all([
      assistanceFetch("/api/client/daily/formations",{cache:"no-store"}),
      assistanceFetch("/api/client/daily/sessions",{cache:"no-store"}),
      assistanceFetch("/api/client/daily/action-center",{cache:"no-store"}),
      assistanceFetch("/api/client/daily/onboarding",{cache:"no-store"}),
      assistanceFetch("/api/client/daily/workspace",{cache:"no-store"})
    ]);
    const[f,s,a,o,w]=await Promise.all(responses.map(r=>r.json().catch(()=>({}))));
    if(!responses[0].ok||!responses[1].ok)throw new Error("Impossible de charger l'activité Daily.");
    if(cancelled)return;
    setFormations((f.formations??[]).filter((x:Formation)=>x.status!=="archived"));
    setSessions((s.sessions??[]).filter((x:Session)=>x.status!=="archived"));
    if(responses[2].ok)setActions(a.actions??[]);
    if(responses[3].ok)setOnboarding(o.onboarding??null);
    if(responses[4].ok)setWorkspace(w.workspace??null);
  }catch(e){if(!cancelled)setError(e instanceof Error?e.message:"Chargement impossible.")}
  finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true}},[]);

  const today=new Date().toISOString().slice(0,10);
  const future=useMemo(()=>sessions.filter(s=>!s.start_date||s.start_date>=today).sort((a,b)=>String(a.start_date??"9999").localeCompare(String(b.start_date??"9999"))),[sessions,today]);
  const sorted=useMemo(()=>{
    const merged=actions.filter(item=>!item.title.toLowerCase().includes("livret d'accueil"));
    const existing=new Set(merged.map(item=>item.title));
    for(const item of missingDocumentActions(onboarding)){if(!existing.has(item.title))merged.push(item)}
    return merged.sort((a,b)=>rank[a.priority]-rank[b.priority]);
  },[actions,onboarding]);

  const requests=formations.filter(f=>f.spontaneous_registration_task_status==="to_attach"&&!future.some(s=>s.formation_id===f.id));
  const next=future[0]??null;
  const orgName=String(workspace?.organisation?.name??onboarding?.organisation_name??"Mon organisme");
  const manager=[onboarding?.manager_first_name,onboarding?.manager_last_name].filter(Boolean).join(" ")||"Mon compte";
  const firstName=onboarding?.manager_first_name?.trim()||"";
  const isQualiopi=onboarding?.qualiopi_status==="yes";
  const qualityEnabled=isQualiopi||onboarding?.quality_tracking_enabled!==false;
  const trainerCount=workspace?.trainers?.length??0;

  async function signOut(){setSigningOut(true);await supabase.auth.signOut();window.location.assign("/client/login")}

  if(loading)return <LoadingMascot message="Sélion rassemble votre activité…"/>;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-12 pt-6 md:px-6 md:pt-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#b28a62]/35 pb-4">
        <Link href="/client" className="font-['Cinzel'] text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[#8a4b24] no-underline">← Mes autres services</Link>
        <button type="button" className="btn-ghost" disabled={signingOut} onClick={()=>void signOut()}>{signingOut?"Déconnexion…":"Se déconnecter"}</button>
      </div>

      {error?<div className="mb-5 border border-[#8a4b24] bg-[#f8efdf] p-4 text-[#8a4b24]">{error}</div>:null}

      <section className="gazette-card p-6 md:p-9">
        <div className="gazette-band" />
        <div className="grid gap-7 pt-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <span className="gazette-label">Votre espace de gestion formation</span>
            <h1 className="mt-5 font-['Playfair_Display'] text-4xl font-bold leading-[1.02] text-[#3e2a1f] md:text-6xl">
              {firstName?`Bonjour ${firstName},`:"Bonjour,"}<br/>
              <em className="font-normal text-[#8a4b24]">votre activité est ici.</em>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#5a4031] md:text-lg">
              {sorted.length?"Les éléments qui nécessitent votre attention sont regroupés en priorité, pour que vous sachiez immédiatement par où commencer.":"Tout est à jour. Votre prochaine session et vos raccourcis restent accessibles en un coup d’œil."}
            </p>
          </div>
          <div className="border border-[#b28a62]/45 bg-[#efe3cf]/70 px-5 py-4 text-center md:min-w-52">
            <strong className="block font-['Playfair_Display'] text-4xl text-[#8a4b24]">{sorted.length||"✓"}</strong>
            <span className="mt-1 block font-['Cinzel'] text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[#8a6243]">{sorted.length?`action${sorted.length>1?"s":""} à traiter`:"Tout est à jour"}</span>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Vue d'ensemble">
        <Metric value={formations.length} label="Formation" plural={formations.length>1}/>
        <Metric value={future.length} label="Session à venir" plural={future.length>1}/>
        <Metric value={trainerCount} label="Formateur" plural={trainerCount>1}/>
        <Metric value={requests.length} label="Demande sans date" plural={requests.length>1} alert={requests.length>0}/>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-6">
          <section className="gazette-card p-5 md:p-7">
            <div className="gazette-band" />
            <div className="flex flex-wrap items-start justify-between gap-3 pt-2">
              <div><span className="gazette-label">À faire maintenant</span><h2 className="mt-4 text-3xl font-bold">{sorted.length?"Vos prochaines actions":"Vous êtes à jour"}</h2></div>
              <span className="border border-[#b28a62]/40 bg-[#efe3cf]/65 px-3 py-2 font-['Cinzel'] text-[0.6rem] font-bold uppercase tracking-[0.12em] text-[#8a6243]">{sorted.length?`${sorted.length} en attente`:"À jour"}</span>
            </div>
            {sorted.length===0?
              <div className="mt-5 border-y border-[#b28a62]/30 py-5 text-[#5a4031]"><strong className="text-[#3e2a1f]">Aucune action n’attend votre intervention.</strong><p className="mt-2">Daily continuera de faire remonter ici uniquement ce qui mérite réellement votre attention.</p></div>
              :<div className="mt-5 divide-y divide-[#b28a62]/25 border-y border-[#b28a62]/30">{sorted.map((item,index)=><Link key={item.id} href={item.href} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 py-4 text-[#3e2a1f] no-underline hover:bg-[#efe3cf]/35"><span className="font-['Cinzel'] text-[0.62rem] font-bold text-[#8a6243]">{String(index+1).padStart(2,"0")}</span><span><strong className="block text-base">{item.title}</strong><small className="mt-1 block leading-5 text-[#6e4a32]">{item.sessionLabel?`${item.sessionLabel} · `:""}{item.detail}</small></span><span className="text-xl text-[#8a4b24]">→</span></Link>)}</div>}
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <article className="gazette-card p-5 md:p-6"><div className="gazette-band"/><span className="gazette-label">Prochaine session</span><h2 className="mt-4 text-2xl font-bold">{next?.daily_formations?.title??"Aucune session planifiée"}</h2>{next?<><p className="mt-4 text-lg italic text-[#8a4b24]">{formatDate(next.start_date)}</p><p className="mt-1 text-[#5a4031]">{formatModality(next)}</p><Link href={`/client/daily/sessions?session=${next.id}`} className="mt-5 inline-block font-['Cinzel'] text-[0.66rem] font-bold uppercase tracking-[0.12em] text-[#8a4b24]">Ouvrir la session →</Link></>:<p className="mt-4 text-[#5a4031]">Votre planning est libre pour le moment.</p>}</article>
            <article className="gazette-card p-5 md:p-6"><div className="gazette-band"/><span className="gazette-label">À surveiller</span><h2 className="mt-4 text-2xl font-bold">Demandes sans date</h2>{requests.length===0?<p className="mt-4 text-[#5a4031]">Aucune demande n’attend de date.</p>:<div className="mt-4 divide-y divide-[#b28a62]/25">{requests.slice(0,3).map(f=><Link key={f.id} href={`/client/daily/sessions?formation=${f.id}`} className="block py-3 text-[#3e2a1f] no-underline"><strong>{f.title}</strong><small className="mt-1 block text-[#8a4b24]">Planifier une session →</small></Link>)}</div>}</article>
          </div>
        </div>

        <aside className="grid content-start gap-5">
          <article className="gazette-card p-5"><div className="gazette-band"/><span className="gazette-label">Votre organisme</span><div className="mt-4 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center border border-[#b28a62]/50 bg-[#efe3cf] font-['Playfair_Display'] text-xl font-bold text-[#8a4b24]">{manager.slice(0,1).toUpperCase()}</div><div><h2 className="text-xl font-bold">{orgName}</h2><p className="text-sm text-[#6e4a32]">{manager}</p></div></div><Link href="/client/daily/mon-compte" className="mt-5 block border-t border-[#b28a62]/30 pt-4 font-['Cinzel'] text-[0.62rem] font-bold uppercase tracking-[0.1em] text-[#8a4b24]">Profil et organisme →</Link></article>
          <section className="grid gap-2"><div className="mb-1"><span className="gazette-label">Accès rapide</span><h2 className="mt-3 text-2xl font-bold">Gérer votre activité</h2></div><Side href="/client/daily/formations" title="Formations" detail={`${formations.length} active${formations.length>1?"s":""}`}/><Side href="/client/daily/sessions" title="Sessions" detail={`${future.length} à venir`}/><Side href="/client/daily/apprenants" title="Apprenants" detail="Dossiers et suivi"/><Side href="/client/daily/generateur-documents" title="Dossiers apprenants" detail="Générer les documents"/><Side href="/client/daily/formateurs" title="Formateurs" detail={`${trainerCount} référencé${trainerCount>1?"s":""}`}/><Side href="/client/daily/qualite" title="Suivi Qualité" detail={isQualiopi?"Qualiopi · suivi actif":qualityEnabled?"Suivi actif":"Désactivé"} muted={!qualityEnabled}/></section>
        </aside>
      </div>
    </main>
  );
}

function Metric({value,label,plural,alert=false}:{value:number;label:string;plural:boolean;alert?:boolean}){
  return <div className={`border px-4 py-4 ${alert?"border-[#8a4b24] bg-[#8a4b24]/5":"border-[#b28a62]/40 bg-[#fffaf0]/60"}`}><strong className="font-['Playfair_Display'] text-3xl text-[#8a4b24]">{value}</strong><span className="ml-2 text-sm text-[#5a4031]">{label}{plural?"s":""}</span></div>;
}

function Side({href,title,detail,muted=false}:{href:string;title:string;detail:string;muted?:boolean}){
  return <Link href={href} className={`grid grid-cols-[1fr_auto] items-center gap-3 border border-[#b28a62]/35 bg-[#fffaf0]/55 px-4 py-3 text-[#3e2a1f] no-underline hover:bg-[#efe3cf]/65 ${muted?"opacity-55":""}`}><span><strong className="block">{title}</strong><small className="text-[#6e4a32]">{detail}</small></span><span className="text-[#8a4b24]">→</span></Link>;
}
