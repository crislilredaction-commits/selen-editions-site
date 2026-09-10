"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { normalizePortalRole, PORTAL_ROLE_CONFIG } from "@/lib/daily/portalRoleConfig";

type Json = Record<string, any>;
type Props = { role: string; token: string };
const text = (value: unknown) => String(value ?? "").trim();
const docLabel = (doc: Json) => {
  if (doc.document_type === "convocation") return "Ma convocation";
  if (doc.document_type === "registration_positioning") return "Mon dossier d'inscription / positionnement";
  if (doc.document_type === "training_program") return "Programme de formation";
  if (doc.document_type === "completion_certificate") return "Certificat de réalisation";
  return doc.logical_name || "Document";
};
function phase(session: Json | undefined) {
  const now = Date.now();
  const start = session?.start_date ? new Date(`${session.start_date}T00:00:00`).getTime() : NaN;
  const end = session?.end_date ? new Date(`${session.end_date}T23:59:59`).getTime() : NaN;
  if (Number.isFinite(start) && now < start) return "before";
  if (Number.isFinite(end) && now > end) return "after";
  return "during";
}

export default function DailyStakeholderWorkspace({ role, token }: Props) {
  const normalizedRole = normalizePortalRole(role);
  const [data, setData] = useState<Json | null>(null);
  const [resources, setResources] = useState<Json[]>([]);
  const [followup, setFollowup] = useState<Json[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true); setError("");
    try {
      const requests = [fetch(`/api/daily-portal/${token}`, { cache: "no-store" }), fetch(`/api/daily-portal/${token}/resources`, { cache: "no-store" })];
      if (normalizedRole === "trainer") requests.push(fetch(`/api/daily-portal/${token}/followup`, { cache: "no-store" }));
      const responses = await Promise.all(requests); const payloads = await Promise.all(responses.map((r) => r.json().catch(() => ({}))));
      if (!responses[0].ok) throw new Error(payloads[0].error ?? "Portail indisponible.");
      setData(payloads[0]); if (responses[1].ok) setResources(payloads[1].documents ?? []);
      if (normalizedRole === "trainer" && responses[2]?.ok) setFollowup(payloads[2].entries ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Portail indisponible."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, [token, normalizedRole]);

  const config = normalizedRole ? PORTAL_ROLE_CONFIG[normalizedRole] : null;
  const formation = data?.session?.daily_formations;
  const participants = data?.participants ?? [];
  const currentPhase = phase(data?.session);
  const learnerActions = useMemo(() => {
    if (normalizedRole !== "learner" || !data) return [];
    const actions: {label:string;detail:string;href?:string;status:"todo"|"done"|"info"}[] = [];
    const positioning = text(data.enrolment?.positioning_status);
    if (currentPhase !== "after") {
      actions.push(positioning === "completed" || positioning === "validated"
        ? { label:"Positionnement", detail:"Votre positionnement est enregistré.", status:"done" }
        : { label:"Positionnement", detail:"Répondez au questionnaire avant la formation ou, si nécessaire, au tout début de la session.", href:`/daily/portail/${role}/${token}/positionnement`, status:"todo" });
    }
    const convocation = resources.find((doc) => doc.document_type === "convocation");
    if (currentPhase === "before") actions.push(convocation
      ? { label:"Consulter ma convocation", detail:"Vérifiez les dates, horaires et modalités pratiques.", href:`/api/daily-portal/${token}/document?id=${convocation.id}`, status:"todo" }
      : { label:"Convocation", detail:"Elle n'est pas encore disponible dans votre espace.", status:"info" });
    if (currentPhase === "after") actions.push({ label:"Mon évaluation", detail:"Complétez votre évaluation de fin de formation.", href:`/daily/portail/${role}/${token}/evaluation`, status:"todo" });
    actions.push({ label:"Réclamation / suggestion", detail:"Signalez une difficulté ou transmettez une suggestion à tout moment.", href:`/daily/portail/${role}/${token}/feedback`, status:"info" });
    return actions;
  }, [normalizedRole, data, resources, currentPhase, role, token]);
  const genericActions = useMemo(() => {
    if (!normalizedRole || normalizedRole === "learner") return [];
    return [
      { label: normalizedRole === "trainer" ? "Satisfaction formateur" : "Satisfaction commanditaire", href: `/daily/portail/${role}/${token}/satisfaction` },
      { label: "Réclamation / suggestion", href: `/daily/portail/${role}/${token}/feedback` },
    ];
  }, [normalizedRole, role, token]);

  async function addFollowup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/daily-portal/${token}/followup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setError(payload.error ?? "Enregistrement impossible.");
    event.currentTarget.reset(); setMessage("Le suivi de session a été complété."); await reload();
  }

  if (!normalizedRole || !config) return <main style={s.page}><p style={s.error}>Rôle de portail invalide.</p></main>;
  return <main style={s.page}>
    <header style={s.hero}><span style={s.kicker}>Selen Daily · Espace {config.label}</span><h1 style={s.title}>{formation?.title ?? data?.access?.entityName ?? "Selen Daily"}</h1><p style={s.lead}>{data?.access?.entityName ? `Bonjour ${data.access.entityName}. ` : ""}Retrouvez ici uniquement les informations et actions qui vous concernent. Votre session, vos documents et vos prochaines étapes restent regroupés au même endroit.</p></header>
    {loading ? <p>Ouverture de votre espace…</p> : null}{error ? <p style={s.error}>{error}</p> : null}{message ? <p style={s.success}>{message}</p> : null}
    {data ? <div style={s.grid}>
      <section style={s.card}><div style={s.cardHead}><h2 style={s.h2}>Ma session</h2>{normalizedRole === "learner" ? <span style={s.badge}>{currentPhase === "before" ? "Avant la formation" : currentPhase === "after" ? "Après la formation" : "Formation en cours"}</span> : null}</div><p><strong>Dates :</strong> {text(data.session?.start_date) || "à préciser"}{data.session?.end_date ? ` → ${data.session.end_date}` : ""}</p><p><strong>Lieu :</strong> {text(data.session?.location_address) || text(data.session?.remote_url) || "à préciser"}</p>{formation?.global_objective ? <p><strong>Objectif :</strong> {formation.global_objective}</p> : null}</section>
      {normalizedRole === "learner" ? <section style={{...s.card,gridColumn:"1 / -1"}}><h2 style={s.h2}>À faire maintenant</h2><div style={s.actionGrid}>{learnerActions.map((action) => <article key={action.label} style={s.actionCard}><div><strong>{action.label}</strong><p style={s.muted}>{action.detail}</p></div>{action.href ? <a style={s.buttonLink} href={action.href} target={action.href.startsWith("/api/") ? "_blank" : undefined} rel={action.href.startsWith("/api/") ? "noreferrer" : undefined}>Ouvrir</a> : <span style={action.status === "done" ? s.done : s.info}>{action.status === "done" ? "Fait" : action.status === "todo" ? "À faire" : "Information"}</span>}</article>)}</div></section> : null}
      {normalizedRole !== "learner" ? <section style={s.card}><h2 style={s.h2}>Participants</h2>{participants.length ? participants.map((p: Json, i: number) => <div key={i}>{[p.first_name,p.last_name].filter(Boolean).join(" ") || p.email || "Participant"}</div>) : <p>Aucun participant rattaché pour le moment.</p>}</section> : null}
      <section style={{...s.card,gridColumn:"1 / -1"}}><h2 style={s.h2}>Mes documents</h2>{resources.length ? <div style={s.documents}>{resources.map((doc: Json) => <a style={s.documentLink} key={doc.id} href={`/api/daily-portal/${token}/document?id=${doc.id}`} target="_blank" rel="noreferrer"><strong>{docLabel(doc)}</strong><span>{doc.version ? `Version ${doc.version}` : "Ouvrir le document"}</span></a>)}</div> : <p style={s.muted}>Aucun document n’est disponible pour le moment.</p>}</section>
      {normalizedRole === "trainer" ? <section style={{...s.card, gridColumn:"1 / -1"}}><h2 style={s.h2}>Fiche de suivi de session</h2><form onSubmit={addFollowup} style={s.form}><select name="entry_type" defaultValue="incident"><option value="incident">Incident / difficulté</option><option value="adaptation">Adaptation</option></select><select name="level" defaultValue="info"><option value="info">Information</option><option value="attention">À suivre</option><option value="critical">Critique</option></select><input name="summary" required placeholder="Constat"/><textarea name="description" placeholder="Détails utiles"/><textarea name="action_taken" placeholder="Action engagée"/><button type="submit">Ajouter au suivi</button></form><div style={s.stack}>{followup.map((entry) => <article key={entry.id} style={s.followup}><strong>{entry.summary}</strong><span>{entry.entry_type} · {entry.level} · {entry.status === "resolved" ? "traité" : "ouvert"}</span>{entry.description ? <p>{entry.description}</p> : null}{entry.action_taken ? <p>Suite : {entry.action_taken}</p> : null}</article>)}</div></section> : null}
      {normalizedRole !== "learner" ? <section style={s.card}><h2 style={s.h2}>Mes actions</h2>{genericActions.map((action) => <a key={action.href} href={action.href}>{action.label}</a>)}</section> : null}
    </div> : null}
  </main>;
}

const s: Record<string, React.CSSProperties> = {
  page:{maxWidth:1100,margin:"0 auto",padding:"2rem 1rem 5rem",color:"var(--ink)"},hero:{display:"grid",gap:8,marginBottom:18,padding:"1.2rem",border:"1px solid var(--sepia-mid)",background:"var(--paper)"},kicker:{fontWeight:800,color:"var(--rust)",fontSize:12,textTransform:"uppercase",letterSpacing:".08em"},title:{margin:0,fontSize:"clamp(1.8rem,4vw,2.6rem)"},lead:{margin:0,lineHeight:1.6,color:"var(--ink-soft)"},grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14},card:{display:"grid",gap:10,padding:18,border:"1px solid var(--sepia-mid)",background:"var(--paper)"},cardHead:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"},h2:{margin:0,fontSize:20},badge:{padding:".28rem .55rem",border:"1px solid var(--sepia-mid)",fontSize:12,fontWeight:800},actionGrid:{display:"grid",gap:10},actionCard:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:12,border:"1px solid var(--sepia-mid)",flexWrap:"wrap"},muted:{margin:".25rem 0 0",color:"var(--ink-soft)",lineHeight:1.5},buttonLink:{display:"inline-block",padding:".55rem .75rem",background:"var(--rust)",color:"#fff",textDecoration:"none",fontWeight:800,borderRadius:6},done:{fontSize:12,fontWeight:800,color:"#45663f"},info:{fontSize:12,fontWeight:800,color:"var(--rust)"},documents:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10},documentLink:{display:"grid",gap:4,padding:12,border:"1px solid var(--sepia-mid)",color:"var(--ink)",textDecoration:"none"},form:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8},stack:{display:"grid",gap:8},followup:{display:"grid",gap:4,padding:10,border:"1px solid var(--sepia-mid)"},error:{padding:12,border:"1px solid #a64",background:"#fff4ef"},success:{padding:12,border:"1px solid #7a8",background:"#f4fff5"}
};
