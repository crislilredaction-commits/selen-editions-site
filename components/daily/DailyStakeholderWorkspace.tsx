"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { normalizePortalRole, PORTAL_ROLE_CONFIG } from "@/lib/daily/portalRoleConfig";

type Json = Record<string, any>;
type Props = { role: string; token: string };
const text = (value: unknown) => String(value ?? "").trim();

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
  const actions = useMemo(() => {
    if (!normalizedRole) return [];
    const base = [{ label: "Réclamation / suggestion", href: `/daily/portail/${role}/${token}/feedback` }];
    if (normalizedRole === "learner") base.unshift({ label: "Mon évaluation", href: `/daily/portail/${role}/${token}/evaluation` });
    if (normalizedRole !== "learner") base.unshift({ label: normalizedRole === "trainer" ? "Satisfaction formateur" : "Satisfaction commanditaire", href: `/daily/portail/${role}/${token}/satisfaction` });
    return base;
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
    <header style={s.hero}><span style={s.kicker}>Espace {config.label}</span><h1>{formation?.title ?? data?.access?.entityName ?? "Selen Daily"}</h1><p>{data?.access?.entityName ? `Bonjour ${data.access.entityName}. ` : ""}Retrouvez ici uniquement les informations et actions qui vous concernent.</p></header>
    {loading ? <p>Ouverture de votre espace…</p> : null}{error ? <p style={s.error}>{error}</p> : null}{message ? <p style={s.success}>{message}</p> : null}
    {data ? <div style={s.grid}>
      <section style={s.card}><h2>Ma session</h2><p>{text(data.session?.start_date) || "Date à préciser"}{data.session?.end_date ? ` → ${data.session.end_date}` : ""}</p><p>{text(data.session?.location_address) || text(data.session?.remote_url) || "Lieu à préciser"}</p></section>
      {normalizedRole !== "learner" ? <section style={s.card}><h2>Participants</h2>{participants.length ? participants.map((p: Json, i: number) => <div key={i}>{[p.first_name,p.last_name].filter(Boolean).join(" ") || p.email || "Participant"}</div>) : <p>Aucun participant rattaché pour le moment.</p>}</section> : null}
      <section style={s.card}><h2>Documents</h2>{resources.length ? resources.map((doc: Json) => <a key={doc.id} href={`/api/daily-portal/${token}/document?id=${doc.id}`} target="_blank" rel="noreferrer">{doc.logical_name || doc.document_type}{doc.version ? ` · v${doc.version}` : ""}</a>) : <p>Aucun document disponible pour le moment.</p>}</section>
      {normalizedRole === "trainer" ? <section style={{...s.card, gridColumn:"1 / -1"}}><h2>Fiche de suivi de session</h2><form onSubmit={addFollowup} style={s.form}><select name="entry_type" defaultValue="incident"><option value="incident">Incident / difficulté</option><option value="adaptation">Adaptation</option></select><select name="level" defaultValue="info"><option value="info">Information</option><option value="attention">À suivre</option><option value="critical">Critique</option></select><input name="summary" required placeholder="Constat"/><textarea name="description" placeholder="Détails utiles"/><textarea name="action_taken" placeholder="Action engagée"/><button type="submit">Ajouter au suivi</button></form><div style={s.stack}>{followup.map((entry) => <article key={entry.id} style={s.followup}><strong>{entry.summary}</strong><span>{entry.entry_type} · {entry.level} · {entry.status === "resolved" ? "traité" : "ouvert"}</span>{entry.description ? <p>{entry.description}</p> : null}{entry.action_taken ? <p>Suite : {entry.action_taken}</p> : null}</article>)}</div></section> : null}
      <section style={s.card}><h2>Mes actions</h2>{actions.map((action) => <a key={action.href} href={action.href}>{action.label}</a>)}</section>
    </div> : null}
  </main>;
}

const s: Record<string, React.CSSProperties> = { page:{maxWidth:1100,margin:"0 auto",padding:"2rem 1rem 5rem",color:"var(--ink)"},hero:{display:"grid",gap:8,marginBottom:18},kicker:{fontWeight:800,color:"var(--rust)"},grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14},card:{display:"grid",gap:10,padding:18,border:"1px solid var(--sepia-mid)",background:"var(--paper)"},form:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8},stack:{display:"grid",gap:8},followup:{display:"grid",gap:4,padding:10,border:"1px solid var(--sepia-mid)"},error:{padding:12,border:"1px solid #a64",background:"#fff4ef"},success:{padding:12,border:"1px solid #7a8",background:"#f4fff5"} };
